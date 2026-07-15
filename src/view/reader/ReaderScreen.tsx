import { useState } from "react";
import type { App } from "obsidian";

import type {
  AnswerDocument,
  AnswerOrder,
  QuestionSummary,
  ReaderSnapshot,
  ZhihuTarget,
} from "@/domain/zhihu";
import type { ZhihuAuthSnapshot } from "@/auth/types";
import type { DailyHotListSnapshot } from "@/hotlist/DailyHotList";
import type { QuestionHistoryEntry } from "@/history/QuestionHistory";
import {
  DailyHotPopover,
  type DailyHotPopoverActions,
} from "@/view/reader/DailyHotPopover";
import {
  HistoryPopover,
  type HistoryPopoverActions,
} from "@/view/reader/HistoryPopover";
import { MarkdownContent } from "@/view/reader/MarkdownContent";

export interface PreparedAnswer {
  readonly answer: AnswerDocument;
  readonly markdown: string | null;
  readonly conversionError: string | null;
}

export type AnswerSaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | {
      readonly status: "saved";
      readonly path: string;
      readonly warnings: readonly string[];
    }
  | { readonly status: "error"; readonly message: string };

export interface ReaderScreenActions
  extends HistoryPopoverActions,
    DailyHotPopoverActions {
  readonly openUrlModal: () => void;
  readonly openFromClipboard: () => void;
  readonly retry: () => void;
  readonly previous: () => void;
  readonly next: () => void;
  readonly changeOrder: (order: AnswerOrder) => void;
  readonly retryNavigation: () => void;
  readonly saveCurrentAnswer: () => void;
  readonly openNote: (path: string) => void;
}

export function ReaderScreen({
  app,
  snapshot,
  preparedAnswer,
  questionMarkdown,
  auth,
  historyEntries,
  isHistoryOpen,
  dailyHotList,
  isDailyHotListOpen,
  saveState,
  actions,
}: {
  readonly app: App;
  readonly snapshot: ReaderSnapshot;
  readonly preparedAnswer: PreparedAnswer | null;
  readonly questionMarkdown: string | null;
  readonly auth: ZhihuAuthSnapshot;
  readonly historyEntries: readonly QuestionHistoryEntry[];
  readonly isHistoryOpen: boolean;
  readonly dailyHotList: DailyHotListSnapshot;
  readonly isDailyHotListOpen: boolean;
  readonly saveState: AnswerSaveState;
  readonly actions: ReaderScreenActions;
}): React.JSX.Element {
  return (
    <main className="zhihu-answers">
      <ReaderToolbar
        auth={auth}
        onOpenUrl={actions.openUrlModal}
        onRefresh={actions.retry}
        canRefresh={snapshot.target !== null && snapshot.phase !== "loading"}
        historyEntries={historyEntries}
        isHistoryOpen={isHistoryOpen}
        historyActions={actions}
        dailyHotList={dailyHotList}
        isDailyHotListOpen={isDailyHotListOpen}
        dailyHotActions={actions}
      />
      {snapshot.phase === "idle" && (
        <EmptyReaderState
          onOpenUrl={actions.openUrlModal}
          onOpenClipboard={actions.openFromClipboard}
        />
      )}
      {snapshot.phase === "loading" && <ReaderLoadingState />}
      {snapshot.phase === "error" && snapshot.target !== null && (
        <ReaderErrorState
          message={snapshot.errorMessage ?? "加载知乎内容时发生未知错误。"}
          target={snapshot.target}
          onRetry={actions.retry}
        />
      )}
      {snapshot.phase === "ready" && snapshot.question !== null && (
        <ReaderReadyState
          app={app}
          snapshot={snapshot}
          preparedAnswer={preparedAnswer}
          questionMarkdown={questionMarkdown}
          saveState={saveState}
          actions={actions}
        />
      )}
    </main>
  );
}

function ReaderToolbar({
  auth,
  onOpenUrl,
  onRefresh,
  canRefresh,
  historyEntries,
  isHistoryOpen,
  historyActions,
  dailyHotList,
  isDailyHotListOpen,
  dailyHotActions,
}: {
  readonly auth: ZhihuAuthSnapshot;
  readonly onOpenUrl: () => void;
  readonly onRefresh: () => void;
  readonly canRefresh: boolean;
  readonly historyEntries: readonly QuestionHistoryEntry[];
  readonly isHistoryOpen: boolean;
  readonly historyActions: HistoryPopoverActions;
  readonly dailyHotList: DailyHotListSnapshot;
  readonly isDailyHotListOpen: boolean;
  readonly dailyHotActions: DailyHotPopoverActions;
}): React.JSX.Element {
  return (
    <header className="zhihu-reader-toolbar">
      <div className="zhihu-reader-toolbar__brand">
        <span className="zhihu-reader-toolbar__mark" aria-hidden="true">
          知
        </span>
        <span>
          <strong>Zhihu Reader</strong>
          <small>专注阅读</small>
        </span>
      </div>
      <nav className="zhihu-reader-toolbar__actions" aria-label="阅读器工具栏">
        <button type="button" onClick={onOpenUrl} aria-label="打开知乎链接">
          打开链接
        </button>
        <DailyHotPopover
          snapshot={dailyHotList}
          isOpen={isDailyHotListOpen}
          actions={dailyHotActions}
        />
        <HistoryPopover
          entries={historyEntries}
          isOpen={isHistoryOpen}
          actions={historyActions}
        />
        <button type="button" onClick={onRefresh} disabled={!canRefresh}>
          刷新
        </button>
        <span className="zhihu-reader-toolbar__login" title={auth.message ?? undefined}>
          {authLabel(auth)}
        </span>
      </nav>
    </header>
  );
}

function EmptyReaderState({
  onOpenUrl,
  onOpenClipboard,
}: {
  readonly onOpenUrl: () => void;
  readonly onOpenClipboard: () => void;
}): React.JSX.Element {
  return (
    <section className="zhihu-answers__empty-state">
      <div className="zhihu-answers__mark" aria-hidden="true">
        知
      </div>
      <h2>Zhihu Reader</h2>
      <p>输入知乎问题或回答链接开始阅读</p>
      <div className="zhihu-answers__empty-actions">
        <button className="mod-cta" type="button" onClick={onOpenUrl}>
          打开链接
        </button>
        <button type="button" onClick={onOpenClipboard}>
          从剪贴板打开
        </button>
      </div>
    </section>
  );
}

function ReaderLoadingState(): React.JSX.Element {
  return (
    <section
      className="zhihu-reader-shell zhihu-reader-loading"
      role="status"
      aria-live="polite"
    >
      <div className="zhihu-reader-skeleton zhihu-reader-skeleton--title" />
      <div className="zhihu-reader-skeleton zhihu-reader-skeleton--card" />
      <span>正在加载知乎内容…</span>
    </section>
  );
}

function ReaderErrorState({
  message,
  target,
  onRetry,
}: {
  readonly message: string;
  readonly target: ZhihuTarget;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <section className="zhihu-reader-shell zhihu-reader-error" role="alert">
      <span className="zhihu-reader-status__eyebrow">加载失败</span>
      <h2>暂时无法显示知乎内容</h2>
      <p>{message}</p>
      <div className="zhihu-reader-error__actions">
        <button className="mod-cta" type="button" onClick={onRetry}>
          重试
        </button>
        <button type="button" onClick={() => openTargetInBrowser(target)}>
          在浏览器打开
        </button>
      </div>
    </section>
  );
}

function ReaderReadyState({
  app,
  snapshot,
  preparedAnswer,
  questionMarkdown,
  actions,
  saveState,
}: {
  readonly app: App;
  readonly snapshot: ReaderSnapshot;
  readonly preparedAnswer: PreparedAnswer | null;
  readonly questionMarkdown: string | null;
  readonly actions: ReaderScreenActions;
  readonly saveState: AnswerSaveState;
}): React.JSX.Element {
  return (
    <div className="zhihu-reader-shell">
      <QuestionSummaryCard
        app={app}
        question={snapshot.question!}
        markdown={questionMarkdown}
      />
      {preparedAnswer === null ? (
        <section className="zhihu-reader-status" role="status">
          <h2>这个问题暂时没有可显示的回答</h2>
          <p>可以稍后刷新，或在浏览器中查看问题。</p>
        </section>
      ) : (
        <AnswerCard
          app={app}
          prepared={preparedAnswer}
          saveState={saveState}
          onSave={actions.saveCurrentAnswer}
          onOpenNote={actions.openNote}
        />
      )}
      <AnswerNavigation snapshot={snapshot} actions={actions} />
    </div>
  );
}

function QuestionSummaryCard({
  app,
  question,
  markdown,
}: {
  readonly app: App;
  readonly question: QuestionSummary;
  readonly markdown: string | null;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="zhihu-question-summary">
      <span className="zhihu-reader-status__eyebrow">知乎问题</span>
      <h1>{question.title}</h1>
      <div className="zhihu-question-summary__meta">
        <span>{question.answerCount} 个回答</span>
        <span>{question.followerCount} 人关注</span>
        {question.topics.map((topic) => (
          <span className="zhihu-question-summary__topic" key={topic.id}>
            {topic.name}
          </span>
        ))}
      </div>
      {expanded && markdown !== null && (
        <div className="zhihu-question-summary__detail">
          <MarkdownContent app={app} markdown={markdown} />
        </div>
      )}
      {markdown !== null && (
        <button
          className="zhihu-question-summary__toggle"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "收起问题描述" : "展开问题描述"}
        </button>
      )}
    </section>
  );
}

function AnswerCard({
  app,
  prepared,
  saveState,
  onSave,
  onOpenNote,
}: {
  readonly app: App;
  readonly prepared: PreparedAnswer;
  readonly saveState: AnswerSaveState;
  readonly onSave: () => void;
  readonly onOpenNote: (path: string) => void;
}): React.JSX.Element {
  const { answer, markdown, conversionError } = prepared;
  return (
    <article className="zhihu-answer-card">
      <header className="zhihu-answer-author">
        {answer.author.avatarUrl === undefined ? (
          <span className="zhihu-answer-author__fallback" aria-hidden="true">
            {answer.author.name.slice(0, 1)}
          </span>
        ) : (
          <img src={answer.author.avatarUrl} alt="" />
        )}
        <div className="zhihu-answer-author__identity">
          <strong>{answer.author.name}</strong>
          {answer.author.headline.length > 0 && <span>{answer.author.headline}</span>}
        </div>
        <div className="zhihu-answer-author__stats">
          <span>{answer.voteupCount} 赞同</span>
          <span>{answer.commentCount} 评论</span>
        </div>
      </header>

      <section className="zhihu-answer-card__content">
        {markdown !== null ? (
          <MarkdownContent app={app} markdown={markdown} />
        ) : (
          <div className="zhihu-answer-conversion-error" role="alert">
            <strong>正文转换失败</strong>
            <p>{conversionError}</p>
            <button type="button" onClick={() => openExternal(answer.url)}>
              阅读知乎原文
            </button>
          </div>
        )}
      </section>

      <footer className="zhihu-answer-card__footer">
        <span>{formatAnswerDate(answer.createdTime)}</span>
        <div>
          <button type="button" onClick={() => openExternal(answer.url)}>
            在浏览器打开
          </button>
          {saveState.status === "saved" ? (
            <button
              className="zhihu-answer-card__saved"
              type="button"
              onClick={() => onOpenNote(saveState.path)}
              title="打开已保存笔记"
            >
              已保存
            </button>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={saveState.status === "saving"}
            >
              {saveState.status === "saving" ? "保存中…" : "保存回答"}
            </button>
          )}
        </div>
      </footer>
      {saveState.status === "error" && (
        <p className="zhihu-answer-card__save-feedback is-error" role="alert">
          {saveState.message}
        </p>
      )}
      {saveState.status === "saved" && saveState.warnings.length > 0 && (
        <div className="zhihu-answer-card__save-feedback" role="status">
          <p>
            笔记已保存；{saveState.warnings.length} 张图片下载失败，已保留远程链接：
          </p>
          <ul>
            {saveState.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function AnswerNavigation({
  snapshot,
  actions,
}: {
  readonly snapshot: ReaderSnapshot;
  readonly actions: ReaderScreenActions;
}): React.JSX.Element {
  const current = snapshot.answers[snapshot.currentIndex];
  const hasQueuedNext = snapshot.currentIndex + 1 < snapshot.answers.length;
  const canNext = current !== undefined && (hasQueuedNext || !snapshot.isEnd);
  const position = current === undefined
    ? "暂无回答"
    : `第 ${snapshot.currentIndex + 1} 篇`;

  return (
    <section className="zhihu-answer-navigation-wrap">
      <nav className="zhihu-answer-navigation" aria-label="回答导航">
        <button
          type="button"
          onClick={actions.previous}
          disabled={snapshot.currentIndex <= 0}
        >
          ← 上一回答
        </button>
        <span>
          <strong>{position}</strong>
          <label>
            <span className="visually-hidden">回答排序</span>
            <select
              value={snapshot.order}
              onChange={(event) =>
                actions.changeOrder(event.target.value as AnswerOrder)
              }
            >
              <option value="default">综合排序</option>
              <option value="updated">最近更新</option>
            </select>
          </label>
        </span>
        <button
          className="mod-cta"
          type="button"
          onClick={actions.next}
          disabled={!canNext || snapshot.isLoadingNextPage}
        >
          {snapshot.isLoadingNextPage ? "加载中…" : "下一回答 →"}
        </button>
      </nav>
      {snapshot.navigationError !== null && (
        <div className="zhihu-answer-navigation__error" role="alert">
          <span>{snapshot.navigationError}</span>
          <button type="button" onClick={actions.retryNavigation}>
            重试加载
          </button>
        </div>
      )}
      {snapshot.isEnd && !hasQueuedNext && current !== undefined && (
        <p className="zhihu-answer-navigation__end">已是最后一篇</p>
      )}
    </section>
  );
}

function authLabel(auth: ZhihuAuthSnapshot): string {
  switch (auth.phase) {
    case "authenticated":
      return auth.profile?.name ?? "已登录";
    case "verifying":
      return "验证登录中";
    case "waiting-scan":
    case "waiting-confirm":
    case "creating-qr":
      return "登录进行中";
    case "expired":
      return "登录已过期";
    default:
      return "未登录";
  }
}

function formatAnswerDate(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return "发布时间未知";
  }
  return `发布于 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp * 1000))}`;
}

function openTargetInBrowser(target: ZhihuTarget): void {
  const url =
    target.type === "question"
      ? `https://www.zhihu.com/question/${target.questionId}`
      : `https://www.zhihu.com/question/${target.questionId ?? ""}/answer/${target.answerId}`;
  openExternal(url);
}

function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
