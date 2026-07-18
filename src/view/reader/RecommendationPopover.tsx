import { useEffect, useRef } from "react";

import type {
  ZhihuRecommendationItem,
} from "@/domain/zhihu";
import type {
  RecommendationFeedSnapshot,
} from "@/recommendation/RecommendationFeed";

export interface RecommendationPopoverActions {
  readonly toggleRecommendations: () => void;
  readonly closeRecommendations: () => void;
  readonly refreshRecommendations: () => void;
  readonly loadMoreRecommendations: () => void;
  readonly retryRecommendations: () => void;
  readonly openRecommendation: (item: ZhihuRecommendationItem) => void;
}

export function RecommendationPopover({
  snapshot,
  isOpen,
  disabled,
  actions,
}: {
  readonly snapshot: RecommendationFeedSnapshot;
  readonly isOpen: boolean;
  readonly disabled: boolean;
  readonly actions: RecommendationPopoverActions;
}): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const closeRef = useRef(actions.closeRecommendations);
  closeRef.current = actions.closeRecommendations;

  useEffect(() => {
    if (!isOpen) {
      if (wasOpen.current) {
        triggerRef.current?.focus();
      }
      wasOpen.current = false;
      return undefined;
    }
    wasOpen.current = true;
    const focusFrame = window.requestAnimationFrame(() => {
      const firstAction = panelRef.current?.querySelector<HTMLElement>(
        "button:not(:disabled)",
      );
      (firstAction ?? panelRef.current)?.focus();
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
  }, [isOpen]);

  return (
    <div className="zhihu-recommendation-popover-anchor">
      <button
        ref={triggerRef}
        type="button"
        onClick={actions.toggleRecommendations}
        disabled={disabled}
        title={disabled ? "登录知乎后查看推荐" : undefined}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        推荐
      </button>
      {isOpen && !disabled && (
        <div
          className="zhihu-recommendation-popover"
          ref={panelRef}
          role="dialog"
          aria-label="知乎推荐流"
          tabIndex={-1}
        >
          <header>
            <div>
              <strong>推荐流</strong>
              <span>{recommendationStatus(snapshot)}</span>
            </div>
            <button
              type="button"
              onClick={actions.refreshRecommendations}
              disabled={snapshot.phase === "loading"}
            >
              {snapshot.phase === "loading" ? "加载中…" : "刷新"}
            </button>
          </header>

          {snapshot.errorMessage !== null && snapshot.items.length === 0 && (
            <div className="zhihu-recommendation-popover__state is-error" role="alert">
              <strong>推荐流加载失败</strong>
              <span>{recommendationError(snapshot)}</span>
              <button type="button" onClick={actions.retryRecommendations}>
                重试
              </button>
            </div>
          )}
          {snapshot.phase === "loading" && snapshot.items.length === 0 && (
            <div className="zhihu-recommendation-popover__state" role="status">
              正在加载为你推荐的内容…
            </div>
          )}
          {snapshot.phase === "ready" && snapshot.items.length === 0 && (
            <div className="zhihu-recommendation-popover__state">
              <span>当前批次没有可阅读的问题或回答</span>
              {!snapshot.isEnd && (
                <button type="button" onClick={actions.loadMoreRecommendations}>
                  继续加载
                </button>
              )}
            </div>
          )}
          {snapshot.items.length > 0 && (
            <ul
              aria-label="知乎推荐内容"
              onScroll={(event) => {
                const list = event.currentTarget;
                if (
                  list.scrollHeight - list.scrollTop - list.clientHeight < 100 &&
                  !snapshot.isEnd &&
                  !snapshot.isLoadingMore
                ) {
                  actions.loadMoreRecommendations();
                }
              }}
            >
              {snapshot.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    title={item.title}
                    onClick={() => actions.openRecommendation(item)}
                  >
                    <span className="zhihu-recommendation-popover__content">
                      <strong>{item.title}</strong>
                      <span>
                        {item.excerpt.length > 0 ? item.excerpt : "暂无内容摘要"}
                      </span>
                      <small>{recommendationMetadata(item)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {snapshot.items.length > 0 && (
            <footer>
              {snapshot.errorMessage !== null && (
                <span role="alert">{snapshot.errorMessage}</span>
              )}
              {snapshot.isEnd ? (
                <span>本批推荐已加载完毕</span>
              ) : (
                <button
                  type="button"
                  disabled={snapshot.isLoadingMore}
                  onClick={
                    snapshot.errorMessage === null
                      ? actions.loadMoreRecommendations
                      : actions.retryRecommendations
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

function recommendationStatus(snapshot: RecommendationFeedSnapshot): string {
  if (snapshot.phase === "loading") {
    return snapshot.items.length === 0 ? "正在获取" : "正在刷新";
  }
  return snapshot.items.length === 0
    ? "知乎个性化推荐"
    : `已加载 ${snapshot.items.length} 条`;
}

function recommendationError(snapshot: RecommendationFeedSnapshot): string {
  return snapshot.errorKind === "authentication"
    ? "知乎推荐要求有效登录，请在插件设置中重新登录。"
    : snapshot.errorMessage ?? "加载知乎推荐时发生未知错误。";
}

function recommendationMetadata(item: ZhihuRecommendationItem): string {
  const metrics = item.target.type === "answer"
    ? [
        item.authorName,
        `${item.voteupCount} 赞同`,
        `${item.commentCount} 评论`,
      ]
    : [];
  return [item.reason, ...metrics]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(" · ");
}
