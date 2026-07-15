import { useEffect, useRef, useState } from "react";

import type {
  AuthorAnswerSummary,
  ZhihuAuthor,
} from "@/domain/zhihu";
import type { AuthorAnswerListSnapshot } from "@/author/AuthorAnswerList";

export interface AuthorAnswersPopoverActions {
  readonly showAuthorAnswers: (author: ZhihuAuthor) => void;
  readonly loadMoreAuthorAnswers: () => void;
  readonly retryAuthorAnswers: () => void;
  readonly openAuthorAnswer: (answer: AuthorAnswerSummary) => void;
}

export function AuthorAnswersPopover({
  author,
  snapshot,
  actions,
}: {
  readonly author: ZhihuAuthor;
  readonly snapshot: AuthorAnswerListSnapshot;
  readonly actions: AuthorAnswersPopoverActions;
}): React.JSX.Element {
  const identifier = author.urlToken ?? author.id;
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const openNow = (): void => {
    setIsOpen(true);
    actions.showAuthorAnswers(author);
  };
  const closeNow = (): void => {
    setIsOpen(false);
  };

  useEffect(() => {
    setIsOpen(false);
  }, [identifier]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNow();
        anchorRef.current
          ?.querySelector<HTMLButtonElement>(
            ".zhihu-author-answers-trigger",
          )
          ?.focus();
      }
    };
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !anchorRef.current?.contains(target)) {
        closeNow();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [isOpen]);

  if (identifier === undefined) {
    return <AuthorAvatar author={author} />;
  }

  const isCurrentAuthor = snapshot.authorIdentifier === identifier;
  const visibleAnswers = isCurrentAuthor ? snapshot.answers : [];
  const phase = isCurrentAuthor ? snapshot.phase : "loading";

  return (
    <div
      className="zhihu-author-answers-anchor"
      ref={anchorRef}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          closeNow();
        }
      }}
    >
      <button
        className="zhihu-author-answers-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`查看 ${author.name} 的回答`}
        title={`查看 ${author.name} 的回答`}
        onClick={() => {
          if (isOpen) {
            closeNow();
          } else {
            openNow();
          }
        }}
      >
        <AuthorAvatar author={author} />
      </button>
      {isOpen && (
        <div
          className="zhihu-author-answers-popover"
          role="dialog"
          aria-label={`${author.name} 的回答`}
        >
          <header>
            <div>
              <strong>{author.name}</strong>
              <span>全部回答 · 最近发布优先</span>
            </div>
          </header>
          {(phase === "loading" || !isCurrentAuthor) && (
            <div className="zhihu-author-answers-popover__state" role="status">
              正在加载用户回答…
            </div>
          )}
          {phase === "error" && visibleAnswers.length === 0 && (
            <div className="zhihu-author-answers-popover__state is-error" role="alert">
              <span>{snapshot.errorMessage ?? "用户回答加载失败。"}</span>
              <button type="button" onClick={actions.retryAuthorAnswers}>
                重试
              </button>
            </div>
          )}
          {phase === "ready" && visibleAnswers.length === 0 && (
            <div className="zhihu-author-answers-popover__state">
              该用户暂时没有公开回答
            </div>
          )}
          {visibleAnswers.length > 0 && (
            <ul
              aria-label={`${author.name} 的回答列表`}
              onScroll={(event) => {
                const list = event.currentTarget;
                if (
                  list.scrollHeight - list.scrollTop - list.clientHeight < 80 &&
                  !snapshot.isEnd &&
                  !snapshot.isLoadingMore
                ) {
                  actions.loadMoreAuthorAnswers();
                }
              }}
            >
              {visibleAnswers.map((answer) => (
                <li key={answer.answerId}>
                  <button
                    type="button"
                    onClick={() => {
                      closeNow();
                      actions.openAuthorAnswer(answer);
                    }}
                  >
                    <span className="zhihu-author-answers-popover__content">
                      <strong>{answer.questionTitle}</strong>
                      <span>
                        {answer.excerpt.length > 0
                          ? answer.excerpt
                          : "暂无回答摘要"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {visibleAnswers.length > 0 && (
            <footer>
              {snapshot.errorMessage !== null && (
                <span role="alert">{snapshot.errorMessage}</span>
              )}
              {snapshot.isEnd ? (
                <span>已显示全部回答</span>
              ) : (
                <button
                  type="button"
                  disabled={snapshot.isLoadingMore}
                  onClick={
                    snapshot.errorMessage === null
                      ? actions.loadMoreAuthorAnswers
                      : actions.retryAuthorAnswers
                  }
                >
                  {snapshot.isLoadingMore
                    ? "加载中…"
                    : snapshot.errorMessage === null
                      ? "加载更多"
                      : "重试加载"}
                </button>
              )}
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

function AuthorAvatar({ author }: { readonly author: ZhihuAuthor }): React.JSX.Element {
  return author.avatarUrl === undefined ? (
    <span className="zhihu-answer-author__fallback" aria-hidden="true">
      {author.name.slice(0, 1)}
    </span>
  ) : (
    <img src={author.avatarUrl} alt="" />
  );
}
