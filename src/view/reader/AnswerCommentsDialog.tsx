import { useEffect, useRef } from "react";
import type { App } from "obsidian";

import type {
  AnswerDocument,
  CommentOrder,
  ZhihuComment,
} from "@/domain/zhihu";
import type { AnswerCommentListSnapshot } from "@/comments/AnswerCommentList";
import { zhihuHtmlToMarkdown } from "@/markdown/toMarkdown";
import { MarkdownContent } from "@/view/reader/MarkdownContent";

export interface AnswerCommentsDialogActions {
  readonly closeComments: () => void;
  readonly changeCommentOrder: (order: CommentOrder) => void;
  readonly loadMoreComments: () => void;
  readonly retryComments: () => void;
  readonly toggleCommentReplies: (comment: ZhihuComment) => void;
  readonly loadMoreCommentReplies: (commentId: string) => void;
  readonly retryCommentReplies: (commentId: string) => void;
}

export function AnswerCommentsDialog({
  app,
  answer,
  snapshot,
  actions,
}: {
  readonly app: App;
  readonly answer: AnswerDocument;
  readonly snapshot: AnswerCommentListSnapshot;
  readonly actions: AnswerCommentsDialogActions;
}): React.JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeCommentsRef = useRef(actions.closeComments);
  closeCommentsRef.current = actions.closeComments;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCommentsRef.current();
        return;
      }
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
        );
        if (focusable === undefined || focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  const onScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget;
    if (
      element.scrollHeight - element.scrollTop - element.clientHeight < 120 &&
      snapshot.phase === "ready" &&
      !snapshot.isEnd &&
      !snapshot.isLoadingMore
    ) {
      actions.loadMoreComments();
    }
  };

  return (
    <div
      className="zhihu-comments-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          actions.closeComments();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="zhihu-comments-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zhihu-comments-title"
      >
        <header>
          <div>
            <h2 id="zhihu-comments-title">回答评论</h2>
            <span>{answer.commentCount} 条评论</span>
          </div>
          <label>
            <span className="visually-hidden">评论排序</span>
            <select
              aria-label="评论排序"
              value={snapshot.order}
              disabled={snapshot.phase === "loading"}
              onChange={(event) =>
                actions.changeCommentOrder(event.target.value as CommentOrder)
              }
            >
              <option value="score">热门评论</option>
              <option value="time">最新评论</option>
            </select>
          </label>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭评论"
            title="关闭"
            onClick={actions.closeComments}
          >
            ×
          </button>
        </header>

        <div className="zhihu-comments-dialog__body" onScroll={onScroll}>
          {snapshot.phase === "loading" && snapshot.comments.length === 0 && (
            <CommentState message="正在加载评论…" />
          )}
          {snapshot.phase === "error" && snapshot.comments.length === 0 && (
            <CommentState
              message={snapshot.errorMessage ?? "评论加载失败。"}
              isError
              onRetry={actions.retryComments}
            />
          )}
          {snapshot.phase === "ready" && snapshot.comments.length === 0 && (
            <CommentState message="这个回答暂时没有评论" />
          )}
          {snapshot.comments.length > 0 && (
            <ol className="zhihu-comments-list">
              {snapshot.comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  app={app}
                  comment={comment}
                  replies={snapshot.replies[comment.id]}
                  actions={actions}
                />
              ))}
            </ol>
          )}
          {snapshot.comments.length > 0 && (
            <div className="zhihu-comments-dialog__pagination">
              {snapshot.errorMessage !== null && (
                <span role="alert">{snapshot.errorMessage}</span>
              )}
              {!snapshot.isEnd && (
                <button
                  type="button"
                  disabled={snapshot.isLoadingMore}
                  onClick={actions.loadMoreComments}
                >
                  {snapshot.isLoadingMore ? "加载中…" : "加载更多评论"}
                </button>
              )}
              {snapshot.isEnd && <span>已显示全部评论</span>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CommentItem({
  app,
  comment,
  replies,
  actions,
  isReply = false,
}: {
  readonly app: App;
  readonly comment: ZhihuComment;
  readonly replies?: AnswerCommentListSnapshot["replies"][string];
  readonly actions: AnswerCommentsDialogActions;
  readonly isReply?: boolean;
}): React.JSX.Element {
  const markdown = commentMarkdown(comment.contentHtml);
  const previewReplies = comment.childComments.slice(0, 2);

  return (
    <li className={isReply ? "zhihu-comment is-reply" : "zhihu-comment"}>
      <CommentAvatar comment={comment} />
      <div className="zhihu-comment__main">
        <div className="zhihu-comment__author">
          <strong>{comment.author.name}</strong>
          {comment.isAnswerAuthor && <span>答主</span>}
          {comment.isTop && <span>置顶</span>}
          {comment.replyToAuthor !== undefined && (
            <small>回复 {comment.replyToAuthor.name}</small>
          )}
        </div>
        <div className="zhihu-comment__content">
          {markdown === null ? (
            <p>评论内容暂时无法显示。</p>
          ) : (
            <MarkdownContent app={app} markdown={markdown} />
          )}
        </div>
        <div className="zhihu-comment__meta">
          <span>{formatCommentDate(comment.createdTime)}</span>
          {comment.likeCount > 0 && <span>{comment.likeCount} 赞</span>}
        </div>

        {!isReply && replies === undefined && previewReplies.length > 0 && (
          <ol className="zhihu-comment__preview-replies">
            {previewReplies.map((reply) => (
              <CommentItem
                key={reply.id}
                app={app}
                comment={reply}
                actions={actions}
                isReply
              />
            ))}
          </ol>
        )}

        {!isReply && comment.childCommentCount > 0 && (
          <div className="zhihu-comment__replies-action">
            <button
              type="button"
              aria-expanded={replies?.isExpanded ?? false}
              onClick={() => actions.toggleCommentReplies(comment)}
            >
              {replies?.isExpanded === true
                ? "收起回复"
                : `查看 ${comment.childCommentCount} 条回复`}
            </button>
          </div>
        )}

        {!isReply && replies?.isExpanded === true && (
          <div className="zhihu-comment__replies">
            {replies.phase === "loading" && <span>正在加载回复…</span>}
            {replies.phase === "error" && (
              <div className="zhihu-comment__replies-error" role="alert">
                <span>{replies.errorMessage ?? "回复加载失败。"}</span>
                <button
                  type="button"
                  onClick={() => actions.retryCommentReplies(comment.id)}
                >
                  重试
                </button>
              </div>
            )}
            {replies.comments.length > 0 && (
              <ol>
                {replies.comments.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    app={app}
                    comment={reply}
                    actions={actions}
                    isReply
                  />
                ))}
              </ol>
            )}
            {replies.phase === "ready" && replies.comments.length === 0 && (
              <span>暂无可显示的回复</span>
            )}
            {replies.phase === "ready" &&
              replies.errorMessage === null &&
              !replies.isEnd && (
              <button
                type="button"
                disabled={replies.isLoadingMore}
                onClick={() => actions.loadMoreCommentReplies(comment.id)}
              >
                {replies.isLoadingMore ? "加载中…" : "加载更多回复"}
              </button>
            )}
            {replies.errorMessage !== null && replies.comments.length > 0 && (
              <div className="zhihu-comment__replies-error" role="alert">
                <span>{replies.errorMessage}</span>
                <button
                  type="button"
                  onClick={() => actions.retryCommentReplies(comment.id)}
                >
                  重试
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CommentAvatar({
  comment,
}: {
  readonly comment: ZhihuComment;
}): React.JSX.Element {
  return comment.author.avatarUrl === undefined ? (
    <span className="zhihu-comment__avatar is-fallback" aria-hidden="true">
      {comment.author.name.slice(0, 1)}
    </span>
  ) : (
    <img
      className="zhihu-comment__avatar"
      src={comment.author.avatarUrl}
      alt=""
      loading="lazy"
    />
  );
}

function CommentState({
  message,
  isError = false,
  onRetry,
}: {
  readonly message: string;
  readonly isError?: boolean;
  readonly onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div
      className={`zhihu-comments-dialog__state${isError ? " is-error" : ""}`}
      role={isError ? "alert" : "status"}
    >
      <span>{message}</span>
      {onRetry !== undefined && (
        <button type="button" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

function commentMarkdown(html: string): string | null {
  try {
    return zhihuHtmlToMarkdown(html);
  } catch {
    return null;
  }
}

function formatCommentDate(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}
