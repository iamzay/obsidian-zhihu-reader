import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  type App,
  ItemView,
  MarkdownRenderChild,
  MarkdownRenderer,
  type WorkspaceLeaf,
} from "obsidian";

import type {
  AnswerDocument,
  QuestionReference,
  ZhihuTarget,
} from "@/domain/zhihu";
import { zhihuHtmlToMarkdown } from "@/markdown/toMarkdown";
import type { ZhihuGateway } from "@/zhihu/gateway";

export const VIEW_TYPE_ZHIHU_ANSWERS = "zhihu-answers-view";

type ReaderState =
  | { readonly kind: "empty" }
  | { readonly kind: "question-placeholder"; readonly target: ZhihuTarget }
  | { readonly kind: "loading"; readonly target: ZhihuTarget }
  | {
      readonly kind: "ready";
      readonly target: ZhihuTarget;
      readonly answer: AnswerDocument;
      readonly markdown: string | null;
      readonly conversionError: string | null;
    }
  | {
      readonly kind: "error";
      readonly target: ZhihuTarget;
      readonly message: string;
    };

export interface ZhihuAnswersViewActions {
  readonly openUrlModal: () => void;
  readonly openFromClipboard: () => void;
}

interface ZhihuAnswersAppProps {
  readonly app: App;
  readonly state: ReaderState;
  readonly actions: ZhihuAnswersViewActions;
  readonly onRetry: () => void;
}

function ZhihuAnswersApp({
  app,
  state,
  actions,
  onRetry,
}: ZhihuAnswersAppProps): React.JSX.Element {
  return (
    <main className="zhihu-answers">
      <ReaderToolbar
        onOpenUrl={actions.openUrlModal}
        onRefresh={onRetry}
        canRefresh={state.kind === "ready" || state.kind === "error"}
      />
      {state.kind === "empty" && (
        <EmptyReaderState
          onOpenUrl={actions.openUrlModal}
          onOpenClipboard={actions.openFromClipboard}
        />
      )}
      {state.kind === "question-placeholder" && (
        <QuestionDevelopmentState target={state.target} />
      )}
      {state.kind === "loading" && <ReaderLoadingState />}
      {state.kind === "error" && (
        <ReaderErrorState
          message={state.message}
          target={state.target}
          onRetry={onRetry}
        />
      )}
      {state.kind === "ready" && (
        <ReaderReadyState app={app} state={state} />
      )}
    </main>
  );
}

interface ReaderToolbarProps {
  readonly onOpenUrl: () => void;
  readonly onRefresh: () => void;
  readonly canRefresh: boolean;
}

function ReaderToolbar({
  onOpenUrl,
  onRefresh,
  canRefresh,
}: ReaderToolbarProps): React.JSX.Element {
  return (
    <header className="zhihu-reader-toolbar">
      <div className="zhihu-reader-toolbar__brand">
        <span className="zhihu-reader-toolbar__mark" aria-hidden="true">
          知
        </span>
        <span>
          <strong>Zhihu Answers</strong>
          <small>专注阅读</small>
        </span>
      </div>
      <nav className="zhihu-reader-toolbar__actions" aria-label="阅读器工具栏">
        <button type="button" onClick={onOpenUrl} aria-label="打开知乎链接">
          打开链接
        </button>
        <button type="button" disabled title="将在 ZA-06 启用">
          历史列表
        </button>
        <button type="button" onClick={onRefresh} disabled={!canRefresh}>
          刷新
        </button>
        <span className="zhihu-reader-toolbar__login" title="登录功能将在 ZA-09 启用">
          未登录
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
      <h2>Zhihu Answers</h2>
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

function QuestionDevelopmentState({
  target,
}: {
  readonly target: ZhihuTarget;
}): React.JSX.Element {
  const questionId = target.type === "question" ? target.questionId : "";
  return (
    <section className="zhihu-reader-shell zhihu-reader-status" role="status">
      <span className="zhihu-reader-status__eyebrow">问题链接已识别</span>
      <h2>问题 {questionId}</h2>
      <p>问题回答队列将在 ZA-04 接入；当前查询已正确传递到阅读 View。</p>
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
      <span>正在加载指定回答…</span>
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
      <h2>暂时无法显示该回答</h2>
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
  state,
}: {
  readonly app: App;
  readonly state: Extract<ReaderState, { kind: "ready" }>;
}): React.JSX.Element {
  return (
    <div className="zhihu-reader-shell">
      <QuestionSummary question={state.answer.question} />
      <AnswerCard app={app} state={state} />
      <nav className="zhihu-answer-navigation" aria-label="回答导航">
        <button type="button" disabled>
          ← 上一回答
        </button>
        <span>
          <strong>指定回答</strong>
          <small>锚点阅读队列</small>
        </span>
        <button type="button" disabled>
          下一回答 →
        </button>
      </nav>
    </div>
  );
}

function QuestionSummary({
  question,
}: {
  readonly question: QuestionReference;
}): React.JSX.Element {
  return (
    <section className="zhihu-question-summary">
      <span className="zhihu-reader-status__eyebrow">知乎问题</span>
      <h1>{question.title}</h1>
      <div className="zhihu-question-summary__meta">
        <a href={question.url} target="_blank" rel="noreferrer">
          在知乎查看问题
        </a>
      </div>
    </section>
  );
}

function AnswerCard({
  app,
  state,
}: {
  readonly app: App;
  readonly state: Extract<ReaderState, { kind: "ready" }>;
}): React.JSX.Element {
  const { answer } = state;
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
        <span className="zhihu-answer-card__anchor">指定回答</span>
      </header>

      <section className="zhihu-answer-card__content">
        {state.markdown !== null ? (
          <MarkdownContent app={app} markdown={state.markdown} />
        ) : (
          <div className="zhihu-answer-conversion-error" role="alert">
            <strong>正文转换失败</strong>
            <p>{state.conversionError}</p>
            <button type="button" onClick={() => window.open(answer.url, "_blank")}>
              阅读知乎原文
            </button>
          </div>
        )}
      </section>

      <footer className="zhihu-answer-card__footer">
        <span>{formatAnswerDate(answer.createdTime)}</span>
        <div>
          <button type="button" onClick={() => window.open(answer.url, "_blank")}>
            在浏览器打开
          </button>
          <button type="button" disabled title="将在 ZA-07 启用">
            保存回答
          </button>
        </div>
      </footer>
    </article>
  );
}

function MarkdownContent({
  app,
  markdown,
}: {
  readonly app: App;
  readonly markdown: string;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }

    let active = true;
    setRenderError(null);
    container.empty();
    const renderChild = new MarkdownRenderChild(container);
    renderChild.load();
    void MarkdownRenderer.render(app, markdown, container, "", renderChild).catch(
      () => {
        if (active) {
          setRenderError("Obsidian 无法渲染转换后的 Markdown，请在浏览器中阅读原文。");
        }
      },
    );

    return () => {
      active = false;
      renderChild.unload();
      container.empty();
    };
  }, [app, markdown]);

  return (
    <>
      {renderError !== null && (
        <div className="zhihu-answer-conversion-error" role="alert">
          {renderError}
        </div>
      )}
      <div
        className="markdown-rendered"
        ref={containerRef}
        hidden={renderError !== null}
      />
    </>
  );
}

export class ZhihuAnswersView extends ItemView {
  private root: Root | null = null;
  private state: ReaderState = { kind: "empty" };
  private requestGeneration = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly gateway: ZhihuGateway,
    private readonly actions: ZhihuAnswersViewActions,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_ZHIHU_ANSWERS;
  }

  getDisplayText(): string {
    return "Zhihu Answers";
  }

  override getIcon(): string {
    return "book-open-text";
  }

  override onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.render();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.requestGeneration += 1;
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }

  async openTarget(target: ZhihuTarget): Promise<void> {
    const generation = ++this.requestGeneration;
    if (target.type === "question") {
      this.state = { kind: "question-placeholder", target };
      this.render();
      return;
    }

    this.state = { kind: "loading", target };
    this.render();
    try {
      const answer = await this.gateway.getAnswer(target.answerId);
      if (generation !== this.requestGeneration) {
        return;
      }

      try {
        const markdown = zhihuHtmlToMarkdown(answer.contentHtml);
        this.state = {
          kind: "ready",
          target,
          answer,
          markdown,
          conversionError: null,
        };
      } catch (error: unknown) {
        this.state = {
          kind: "ready",
          target,
          answer,
          markdown: null,
          conversionError:
            error instanceof Error ? error.message : "回答正文无法转换为 Markdown。",
        };
      }
    } catch (error: unknown) {
      if (generation !== this.requestGeneration) {
        return;
      }
      this.state = {
        kind: "error",
        target,
        message: error instanceof Error ? error.message : "加载回答时发生未知错误。",
      };
    }
    this.render();
  }

  private retry(): void {
    if (this.state.kind !== "empty") {
      void this.openTarget(this.state.target);
    }
  }

  private render(): void {
    this.root?.render(
      <StrictMode>
        <ZhihuAnswersApp
          app={this.app}
          state={this.state}
          actions={this.actions}
          onRetry={() => this.retry()}
        />
      </StrictMode>,
    );
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
  window.open(url, "_blank", "noopener,noreferrer");
}
