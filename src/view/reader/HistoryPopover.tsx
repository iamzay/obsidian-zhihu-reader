import { useEffect, useRef } from "react";

import type { QuestionHistoryEntry } from "@/history/QuestionHistory";

export interface HistoryPopoverActions {
  readonly toggleHistory: () => void;
  readonly closeHistory: () => void;
  readonly openHistoryEntry: (questionId: string) => void;
  readonly removeHistoryEntry: (questionId: string) => void;
  readonly clearHistory: () => void;
}

export function HistoryPopover({
  entries,
  isOpen,
  actions,
}: {
  readonly entries: readonly QuestionHistoryEntry[];
  readonly isOpen: boolean;
  readonly actions: HistoryPopoverActions;
}): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const closeHistoryRef = useRef(actions.closeHistory);
  closeHistoryRef.current = actions.closeHistory;

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
      const firstAction = panelRef.current?.querySelector<HTMLElement>("button");
      (firstAction ?? panelRef.current)?.focus();
    });
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHistoryRef.current();
      }
    };
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (
        target instanceof Node &&
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        closeHistoryRef.current();
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
    <div className="zhihu-history-popover-anchor">
      <button
        ref={triggerRef}
        type="button"
        onClick={actions.toggleHistory}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        历史列表
      </button>
      {isOpen && (
        <div
          className="zhihu-history-popover"
          ref={panelRef}
          role="dialog"
          aria-label="查询历史"
          tabIndex={-1}
        >
          <header>
            <strong>查询历史</strong>
            <span>{entries.length} 个问题</span>
          </header>
          {entries.length === 0 ? (
            <p className="zhihu-history-popover__empty">暂无查询过的问题</p>
          ) : (
            <ul>
              {entries.map((entry) => (
                <li key={entry.questionId}>
                  <button
                    className="zhihu-history-popover__title"
                    type="button"
                    onClick={() => actions.openHistoryEntry(entry.questionId)}
                    title={entry.questionTitle}
                  >
                    <span>{entry.questionTitle}</span>
                    <time dateTime={entry.lastQueriedAt}>
                      {formatHistoryDate(entry.lastQueriedAt)}
                    </time>
                  </button>
                  <button
                    className="zhihu-history-popover__remove"
                    type="button"
                    onClick={() => actions.removeHistoryEntry(entry.questionId)}
                    aria-label={`删除历史：${entry.questionTitle}`}
                    title="删除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {entries.length > 0 && (
            <footer>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("确定清空全部知乎问题查询历史吗？")) {
                    actions.clearHistory();
                  }
                }}
              >
                清空历史
              </button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

const historyDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
});

function formatHistoryDate(value: string): string {
  return historyDateFormatter.format(new Date(value));
}
