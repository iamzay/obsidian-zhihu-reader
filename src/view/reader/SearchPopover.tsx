import { useEffect, useRef, useState } from "react";

import type { SearchAnswerResult } from "@/domain/zhihu";
import type { ZhihuAnswerSearchSnapshot } from "@/search/ZhihuAnswerSearch";

export interface SearchPopoverActions {
  readonly toggleSearch: () => void;
  readonly closeSearch: () => void;
  readonly searchAnswers: (query: string) => void;
  readonly loadMoreSearchAnswers: () => void;
  readonly retrySearchAnswers: () => void;
  readonly openSearchAnswer: (result: SearchAnswerResult) => void;
}

export function SearchPopover({
  snapshot,
  isOpen,
  actions,
}: {
  readonly snapshot: ZhihuAnswerSearchSnapshot;
  readonly isOpen: boolean;
  readonly actions: SearchPopoverActions;
}): React.JSX.Element {
  const [query, setQuery] = useState(snapshot.query);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const closeRef = useRef(actions.closeSearch);
  closeRef.current = actions.closeSearch;

  useEffect(() => {
    if (!isOpen) {
      if (wasOpen.current) {
        triggerRef.current?.focus();
      }
      wasOpen.current = false;
      return undefined;
    }
    wasOpen.current = true;
    setQuery(snapshot.query);
    const focusFrame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
    };
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (
        target instanceof Node &&
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        closeRef.current();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [isOpen, snapshot.query]);

  const submit = (): void => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length > 0) {
      actions.searchAnswers(normalizedQuery);
    }
  };

  return (
    <div className="zhihu-search-popover-anchor">
      <button
        ref={triggerRef}
        type="button"
        onClick={actions.toggleSearch}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        搜索
      </button>
      {isOpen && (
        <div
          className="zhihu-search-popover"
          ref={panelRef}
          role="dialog"
          aria-label="搜索知乎回答"
        >
          <header>
            <div>
              <strong>搜索知乎回答</strong>
              <span>找到结果后在当前阅读器中打开</span>
            </div>
          </header>
          <form
            className="zhihu-search-popover__form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              ref={inputRef}
              type="search"
              value={query}
              maxLength={200}
              placeholder="输入问题或主题关键词"
              aria-label="搜索关键词"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              className="mod-cta"
              type="submit"
              disabled={query.trim().length === 0 || snapshot.phase === "loading"}
            >
              {snapshot.phase === "loading" ? "搜索中…" : "搜索"}
            </button>
          </form>

          {snapshot.errorMessage !== null && snapshot.results.length === 0 && (
            <div className="zhihu-search-popover__state is-error" role="alert">
              <strong>搜索失败</strong>
              <span>
                {snapshot.errorKind === "authentication"
                  ? "知乎搜索要求有效登录或当前登录已失效，请在插件设置中登录后重试。"
                  : snapshot.errorMessage}
              </span>
              <button type="button" onClick={actions.retrySearchAnswers}>
                重试
              </button>
            </div>
          )}
          {snapshot.phase === "loading" && snapshot.results.length === 0 && (
            <div className="zhihu-search-popover__state" role="status">
              正在搜索“{snapshot.query}”…
            </div>
          )}
          {snapshot.phase === "idle" && (
            <div className="zhihu-search-popover__state">
              输入关键词后按 Enter 搜索
            </div>
          )}
          {snapshot.phase === "ready" && snapshot.results.length === 0 && (
            <div className="zhihu-search-popover__state">
              <span>当前结果中没有可阅读的回答</span>
              {!snapshot.isEnd && (
                <button type="button" onClick={actions.loadMoreSearchAnswers}>
                  继续查找
                </button>
              )}
            </div>
          )}
          {snapshot.results.length > 0 && (
            <ul
              aria-label={`“${snapshot.query}”的回答搜索结果`}
              onScroll={(event) => {
                const list = event.currentTarget;
                if (
                  list.scrollHeight - list.scrollTop - list.clientHeight < 100 &&
                  !snapshot.isEnd &&
                  !snapshot.isLoadingMore
                ) {
                  actions.loadMoreSearchAnswers();
                }
              }}
            >
              {snapshot.results.map((result) => (
                <li key={result.answerId}>
                  <button
                    type="button"
                    title={result.questionTitle}
                    onClick={() => actions.openSearchAnswer(result)}
                  >
                    <span className="zhihu-search-popover__content">
                      <strong>{result.questionTitle}</strong>
                      <span>
                        {result.excerpt.length > 0
                          ? result.excerpt
                          : "暂无回答摘要"}
                      </span>
                      <small>
                        {[
                          result.author.name,
                          `${result.voteupCount} 赞同`,
                          `${result.commentCount} 评论`,
                        ].join(" · ")}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {snapshot.results.length > 0 && (
            <footer>
              {snapshot.errorMessage !== null && (
                <span role="alert">{snapshot.errorMessage}</span>
              )}
              {snapshot.isEnd ? (
                <span>已显示全部结果</span>
              ) : (
                <button
                  type="button"
                  disabled={snapshot.isLoadingMore}
                  onClick={
                    snapshot.errorMessage === null
                      ? actions.loadMoreSearchAnswers
                      : actions.retrySearchAnswers
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
