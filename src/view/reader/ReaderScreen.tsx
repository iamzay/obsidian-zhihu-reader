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
import {
  canUseZhihuNetwork,
  zhihuLoginRequirementMessage,
} from "@/auth/access";
import type { AuthorAnswerListSnapshot } from "@/author/AuthorAnswerList";
import type { AnswerCommentListSnapshot } from "@/comments/AnswerCommentList";
import type { DailyHotListSnapshot } from "@/hotlist/DailyHotList";
import type { QuestionHistoryEntry } from "@/history/QuestionHistory";
import type { ZhihuAnswerSearchSnapshot } from "@/search/ZhihuAnswerSearch";
import type { AnswerVoteState } from "@/vote/AnswerVoteController";
import {
  AnswerCommentsDialog,
  type AnswerCommentsDialogActions,
} from "@/view/reader/AnswerCommentsDialog";
import {
  AuthorAnswersPopover,
  type AuthorAnswersPopoverActions,
} from "@/view/reader/AuthorAnswersPopover";
import {
  DailyHotPopover,
  type DailyHotPopoverActions,
} from "@/view/reader/DailyHotPopover";
import {
  HistoryPopover,
  type HistoryPopoverActions,
} from "@/view/reader/HistoryPopover";
import { MarkdownContent } from "@/view/reader/MarkdownContent";
import {
  SearchPopover,
  type SearchPopoverActions,
} from "@/view/reader/SearchPopover";

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
    DailyHotPopoverActions,
    AuthorAnswersPopoverActions,
    AnswerCommentsDialogActions,
    SearchPopoverActions {
  readonly openUrlModal: () => void;
  readonly openFromClipboard: () => void;
  readonly retry: () => void;
  readonly previous: () => void;
  readonly next: () => void;
  readonly changeOrder: (order: AnswerOrder) => void;
  readonly retryNavigation: () => void;
  readonly toggleAnswerVote: (answer: AnswerDocument) => void;
  readonly openComments: (answerId: string) => void;
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
  authorAnswerList,
  answerCommentList,
  isCommentsOpen,
  search,
  isSearchOpen,
  isDailyHotListOpen,
  saveState,
  voteState,
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
  readonly authorAnswerList: AuthorAnswerListSnapshot;
  readonly answerCommentList: AnswerCommentListSnapshot;
  readonly isCommentsOpen: boolean;
  readonly search: ZhihuAnswerSearchSnapshot;
  readonly isSearchOpen: boolean;
  readonly isDailyHotListOpen: boolean;
  readonly saveState: AnswerSaveState;
  readonly voteState: AnswerVoteState | null;
  readonly actions: ReaderScreenActions;
}): React.JSX.Element {
  const hasNetworkAccess = canUseZhihuNetwork(auth);
  return (
    <main className="zhihu-answers">
      <ReaderToolbar
        auth={auth}
        hasNetworkAccess={hasNetworkAccess}
        onOpenUrl={actions.openUrlModal}
        onRefresh={actions.retry}
        canRefresh={snapshot.target !== null && snapshot.phase !== "loading"}
        historyEntries={historyEntries}
        isHistoryOpen={isHistoryOpen}
        historyActions={actions}
        dailyHotList={dailyHotList}
        isDailyHotListOpen={isDailyHotListOpen}
        dailyHotActions={actions}
        snapshot={snapshot}
        answerActions={actions}
        search={search}
        isSearchOpen={isSearchOpen}
        searchActions={actions}
      />
      {!hasNetworkAccess && snapshot.phase === "idle" && (
        <LoginRequiredState auth={auth} />
      )}
      {!hasNetworkAccess && snapshot.phase !== "idle" && (
        <LoginRequiredBanner auth={auth} />
      )}
      {hasNetworkAccess && snapshot.phase === "idle" && (
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
          canRetry={hasNetworkAccess}
        />
      )}
      {snapshot.phase === "ready" && snapshot.question !== null && (
        <ReaderReadyState
          app={app}
          snapshot={snapshot}
          preparedAnswer={preparedAnswer}
          questionMarkdown={questionMarkdown}
          authorAnswerList={authorAnswerList}
          answerCommentList={answerCommentList}
          isCommentsOpen={isCommentsOpen}
          saveState={saveState}
          voteState={voteState}
          hasNetworkAccess={hasNetworkAccess}
          actions={actions}
        />
      )}
    </main>
  );
}

function ReaderToolbar({
  auth,
  hasNetworkAccess,
  onOpenUrl,
  onRefresh,
  canRefresh,
  historyEntries,
  isHistoryOpen,
  historyActions,
  dailyHotList,
  isDailyHotListOpen,
  dailyHotActions,
  snapshot,
  answerActions,
  search,
  isSearchOpen,
  searchActions,
}: {
  readonly auth: ZhihuAuthSnapshot;
  readonly hasNetworkAccess: boolean;
  readonly onOpenUrl: () => void;
  readonly onRefresh: () => void;
  readonly canRefresh: boolean;
  readonly historyEntries: readonly QuestionHistoryEntry[];
  readonly isHistoryOpen: boolean;
  readonly historyActions: HistoryPopoverActions;
  readonly dailyHotList: DailyHotListSnapshot;
  readonly isDailyHotListOpen: boolean;
  readonly dailyHotActions: DailyHotPopoverActions;
  readonly snapshot: ReaderSnapshot;
  readonly answerActions: ReaderScreenActions;
  readonly search: ZhihuAnswerSearchSnapshot;
  readonly isSearchOpen: boolean;
  readonly searchActions: SearchPopoverActions;
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
        <button
          type="button"
          onClick={onOpenUrl}
          disabled={!hasNetworkAccess}
          title={hasNetworkAccess ? undefined : "登录知乎后打开内容"}
          aria-label="打开知乎链接"
        >
          打开链接
        </button>
        <SearchPopover
          snapshot={search}
          isOpen={isSearchOpen}
          disabled={!hasNetworkAccess}
          actions={searchActions}
        />
        <DailyHotPopover
          snapshot={dailyHotList}
          isOpen={isDailyHotListOpen}
          disabled={!hasNetworkAccess}
          actions={dailyHotActions}
        />
        <HistoryPopover
          entries={historyEntries}
          isOpen={isHistoryOpen}
          canOpenEntries={hasNetworkAccess}
          actions={historyActions}
        />
        <button
          type="button"
          onClick={onRefresh}
          disabled={!hasNetworkAccess || !canRefresh}
          title={hasNetworkAccess ? undefined : "登录知乎后刷新"}
        >
          刷新
        </button>
        <AuthIndicator auth={auth} />
      </nav>
      {snapshot.phase === "ready" && (
        <AnswerToolbarNavigation
          snapshot={snapshot}
          actions={answerActions}
          disabled={!hasNetworkAccess}
        />
      )}
    </header>
  );
}

function LoginRequiredState({
  auth,
}: {
  readonly auth: ZhihuAuthSnapshot;
}): React.JSX.Element {
  return (
    <section className="zhihu-answers__empty-state zhihu-login-required">
      <div className="zhihu-answers__mark" aria-hidden="true">
        知
      </div>
      <span className="zhihu-reader-status__eyebrow">需要登录</span>
      <h2>请先登录知乎</h2>
      <p>{zhihuLoginRequirementMessage(auth)}</p>
      <small>登录后即可阅读问题和回答、搜索及查看每日热榜。</small>
    </section>
  );
}

function LoginRequiredBanner({
  auth,
}: {
  readonly auth: ZhihuAuthSnapshot;
}): React.JSX.Element {
  return (
    <div className="zhihu-login-required-banner" role="status">
      <strong>知乎登录不可用</strong>
      <span>{zhihuLoginRequirementMessage(auth)}</span>
    </div>
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
  canRetry,
}: {
  readonly message: string;
  readonly target: ZhihuTarget;
  readonly onRetry: () => void;
  readonly canRetry: boolean;
}): React.JSX.Element {
  return (
    <section className="zhihu-reader-shell zhihu-reader-error" role="alert">
      <span className="zhihu-reader-status__eyebrow">加载失败</span>
      <h2>暂时无法显示知乎内容</h2>
      <p>{message}</p>
      <div className="zhihu-reader-error__actions">
        <button
          className="mod-cta"
          type="button"
          onClick={onRetry}
          disabled={!canRetry}
        >
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
  authorAnswerList,
  answerCommentList,
  isCommentsOpen,
  actions,
  saveState,
  voteState,
  hasNetworkAccess,
}: {
  readonly app: App;
  readonly snapshot: ReaderSnapshot;
  readonly preparedAnswer: PreparedAnswer | null;
  readonly questionMarkdown: string | null;
  readonly authorAnswerList: AuthorAnswerListSnapshot;
  readonly answerCommentList: AnswerCommentListSnapshot;
  readonly isCommentsOpen: boolean;
  readonly actions: ReaderScreenActions;
  readonly saveState: AnswerSaveState;
  readonly voteState: AnswerVoteState | null;
  readonly hasNetworkAccess: boolean;
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
          authorAnswerList={authorAnswerList}
          hasNetworkAccess={hasNetworkAccess}
          saveState={saveState}
          voteState={voteState ?? undefined}
          actions={actions}
          onSave={actions.saveCurrentAnswer}
          onOpenNote={actions.openNote}
        />
      )}
      {hasNetworkAccess && isCommentsOpen && preparedAnswer !== null && (
        <AnswerCommentsDialog
          app={app}
          answer={preparedAnswer.answer}
          snapshot={answerCommentList}
          actions={actions}
        />
      )}
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
  authorAnswerList,
  saveState,
  voteState,
  hasNetworkAccess,
  actions,
  onSave,
  onOpenNote,
}: {
  readonly app: App;
  readonly prepared: PreparedAnswer;
  readonly authorAnswerList: AuthorAnswerListSnapshot;
  readonly saveState: AnswerSaveState;
  readonly voteState?: AnswerVoteState;
  readonly hasNetworkAccess: boolean;
  readonly actions: ReaderScreenActions;
  readonly onSave: () => void;
  readonly onOpenNote: (path: string) => void;
}): React.JSX.Element {
  const { answer, markdown, conversionError } = prepared;
  return (
    <article className="zhihu-answer-card">
      <header className="zhihu-answer-author">
        <AuthorAnswersPopover
          author={answer.author}
          snapshot={authorAnswerList}
          disabled={!hasNetworkAccess}
          actions={actions}
        />
        <div className="zhihu-answer-author__identity">
          <strong>{answer.author.name}</strong>
          {answer.author.headline.length > 0 && <span>{answer.author.headline}</span>}
        </div>
        <div className="zhihu-answer-author__stats">
          <button
            className={voteState?.isVoted === true ? "is-voted" : undefined}
            type="button"
            onClick={() => actions.toggleAnswerVote(answer)}
            disabled={!hasNetworkAccess || voteState?.isSubmitting === true}
            title={hasNetworkAccess ? undefined : "登录知乎后赞同回答"}
            aria-pressed={voteState?.isVoted ?? answer.isVoted}
            aria-label={
              voteState?.isVoted === true
                ? `取消赞同，当前 ${voteState.voteupCount} 人赞同`
                : `赞同回答，当前 ${voteState?.voteupCount ?? answer.voteupCount} 人赞同`
            }
          >
            {voteState?.isSubmitting === true
              ? "提交中…"
              : voteState?.isVoted === true
                ? `${voteState.voteupCount} 已赞同`
                : `${voteState?.voteupCount ?? answer.voteupCount} 赞同`}
          </button>
          <button
            type="button"
            onClick={() => actions.openComments(answer.id)}
            disabled={!hasNetworkAccess}
            title={hasNetworkAccess ? undefined : "登录知乎后阅读评论"}
            aria-label={`阅读 ${answer.commentCount} 条评论`}
          >
            {answer.commentCount} 评论
          </button>
        </div>
      </header>
      {voteState?.errorMessage !== null && voteState?.errorMessage !== undefined && (
        <p className="zhihu-answer-card__vote-feedback is-error" role="alert">
          {voteState.errorMessage}
        </p>
      )}

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

function AnswerToolbarNavigation({
  snapshot,
  actions,
  disabled,
}: {
  readonly snapshot: ReaderSnapshot;
  readonly actions: ReaderScreenActions;
  readonly disabled: boolean;
}): React.JSX.Element {
  const current = snapshot.answers[snapshot.currentIndex];
  const hasQueuedNext = snapshot.currentIndex + 1 < snapshot.answers.length;
  const canNext = current !== undefined && (hasQueuedNext || !snapshot.isEnd);
  const position = current === undefined
    ? "暂无回答"
    : `第 ${snapshot.currentIndex + 1} 篇`;

  return (
    <nav
      className="zhihu-reader-toolbar__answer-navigation"
      aria-label="回答导航"
    >
      <button
        type="button"
        onClick={actions.previous}
        disabled={disabled || snapshot.currentIndex <= 0}
        title="上一回答（H）"
        aria-keyshortcuts="H"
      >
        ← 上一回答
      </button>
      <strong className="zhihu-reader-toolbar__answer-position" aria-live="polite">
        {position}
      </strong>
      <label>
        <span className="visually-hidden">回答排序</span>
        <select
          aria-label="回答排序"
          value={snapshot.order}
          disabled={disabled}
          onChange={(event) =>
            actions.changeOrder(event.target.value as AnswerOrder)
          }
        >
          <option value="default">综合排序</option>
          <option value="updated">最近更新</option>
        </select>
      </label>
      <button
        className="mod-cta"
        type="button"
        onClick={actions.next}
        disabled={disabled || !canNext || snapshot.isLoadingNextPage}
        title="下一回答（L）"
        aria-keyshortcuts="L"
      >
        {snapshot.isLoadingNextPage ? "加载中…" : "下一回答 →"}
      </button>
      <span
        className="zhihu-reader-toolbar__shortcut-hint"
        title="快捷键：H 上一回答，J 向下滚动，K 向上滚动，L 下一回答"
        aria-label="阅读快捷键：H 上一回答，J 向下滚动，K 向上滚动，L 下一回答"
      >
        <kbd>H</kbd>/<kbd>L</kbd> 切换
        <span aria-hidden="true"> · </span>
        <kbd>J</kbd>/<kbd>K</kbd> 滚动
      </span>
      {snapshot.navigationError !== null && (
        <span
          className="zhihu-reader-toolbar__answer-feedback is-error"
          role="alert"
          title={snapshot.navigationError}
        >
          <span>下一篇加载失败</span>
          <button
            type="button"
            onClick={actions.retryNavigation}
            disabled={disabled}
          >
            重试
          </button>
        </span>
      )}
      {snapshot.isEnd && !hasQueuedNext && current !== undefined && (
        <span className="zhihu-reader-toolbar__answer-feedback">
          已是最后一篇
        </span>
      )}
    </nav>
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
    case "waiting-web-login":
      return "登录进行中";
    case "expired":
      return "登录已过期";
    default:
      return "未登录";
  }
}

function AuthIndicator({
  auth,
}: {
  readonly auth: ZhihuAuthSnapshot;
}): React.JSX.Element {
  const label = authLabel(auth);
  if (auth.phase !== "authenticated") {
    return (
      <span
        className="zhihu-reader-toolbar__login is-text"
        title={auth.message ?? label}
      >
        {label}
      </span>
    );
  }

  const avatarUrl = auth.profile?.avatarUrl;
  return (
    <span
      className="zhihu-reader-toolbar__login is-avatar"
      role="img"
      aria-label={label}
      title={label}
    >
      {avatarUrl === undefined ? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </svg>
      ) : (
        <img src={avatarUrl} alt="" />
      )}
    </span>
  );
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
