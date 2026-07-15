import { useEffect, useRef } from "react";

import type { DailyHotListSnapshot } from "@/hotlist/DailyHotList";

export interface DailyHotPopoverActions {
  readonly toggleDailyHotList: () => void;
  readonly closeDailyHotList: () => void;
  readonly refreshDailyHotList: () => void;
  readonly openDailyHotItem: (questionId: string) => void;
}

export function DailyHotPopover({
  snapshot,
  isOpen,
  actions,
}: {
  readonly snapshot: DailyHotListSnapshot;
  readonly isOpen: boolean;
  readonly actions: DailyHotPopoverActions;
}): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const closeRef = useRef(actions.closeDailyHotList);
  closeRef.current = actions.closeDailyHotList;

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
    <div className="zhihu-hot-popover-anchor">
      <button
        ref={triggerRef}
        type="button"
        onClick={actions.toggleDailyHotList}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        每日热榜
      </button>
      {isOpen && (
        <div
          className="zhihu-hot-popover"
          ref={panelRef}
          role="dialog"
          aria-label="知乎每日热榜"
          tabIndex={-1}
        >
          <header>
            <div>
              <strong>每日热榜</strong>
              <span>{hotListStatus(snapshot)}</span>
            </div>
            <button
              type="button"
              onClick={actions.refreshDailyHotList}
              disabled={snapshot.phase === "loading"}
            >
              {snapshot.phase === "loading" ? "加载中…" : "刷新"}
            </button>
          </header>
          {snapshot.errorMessage !== null && (
            <div className="zhihu-hot-popover__error" role="alert">
              <strong>热榜加载失败</strong>
              <span>{hotListError(snapshot)}</span>
            </div>
          )}
          {snapshot.items.length > 0 ? (
            <ol>
              {snapshot.items.map((item) => (
                <li key={item.questionId}>
                  <button
                    type="button"
                    onClick={() => actions.openDailyHotItem(item.questionId)}
                    title={item.title}
                  >
                    <span
                      className={
                        item.rank <= 3
                          ? "zhihu-hot-popover__rank is-top"
                          : "zhihu-hot-popover__rank"
                      }
                    >
                      {item.rank}
                    </span>
                    <span className="zhihu-hot-popover__content">
                      <strong>{item.title}</strong>
                      {item.excerpt.length > 0 && <span>{item.excerpt}</span>}
                      <small>
                        {[item.heatLabel, `${item.answerCount} 个回答`]
                          .filter((value) => value.length > 0)
                          .join(" · ")}
                      </small>
                    </span>
                    {item.thumbnailUrl !== undefined && (
                      <img src={item.thumbnailUrl} alt="" loading="lazy" />
                    )}
                  </button>
                </li>
              ))}
            </ol>
          ) : snapshot.phase === "loading" ? (
            <div className="zhihu-hot-popover__loading" role="status">
              正在加载今日热榜…
            </div>
          ) : snapshot.phase === "ready" ? (
            <div className="zhihu-hot-popover__empty">今日暂无热榜内容</div>
          ) : snapshot.phase === "error" ? (
            <footer>
              <button type="button" onClick={actions.refreshDailyHotList}>
                重试
              </button>
            </footer>
          ) : null}
        </div>
      )}
    </div>
  );
}

function hotListStatus(snapshot: DailyHotListSnapshot): string {
  if (snapshot.loadedAt === null) {
    return snapshot.phase === "loading" ? "正在更新" : "知乎实时热度";
  }
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(snapshot.loadedAt))}`;
}

function hotListError(
  snapshot: DailyHotListSnapshot,
): string {
  return snapshot.errorKind === "authentication"
    ? "知乎要求登录或当前登录已失效，请先在插件设置中登录。"
    : snapshot.errorMessage ?? "加载每日热榜时发生未知错误。";
}
