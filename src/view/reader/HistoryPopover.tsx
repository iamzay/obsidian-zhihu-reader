import { useEffect, useRef, useState } from "react";

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
  canOpenEntries,
  actions,
}: {
  readonly entries: readonly QuestionHistoryEntry[];
  readonly isOpen: boolean;
  readonly canOpenEntries: boolean;
  readonly actions: HistoryPopoverActions;
}): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const wasOpen = useRef(false);
  const closeHistoryRef = useRef(actions.closeHistory);
  closeHistoryRef.current = actions.closeHistory;

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingClear(false);
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
            <div>
              <strong>查询历史</strong>
              <span>
                {entries.length === 0
                  ? "最近打开的问题"
                  : `${entries.length} 个问题 · 最近打开`}
              </span>
            </div>
            <button
              type="button"
              disabled={entries.length === 0}
              onClick={() => setIsConfirmingClear(true)}
            >
              清空
            </button>
          </header>
          {isConfirmingClear && (
            <div
              className="zhihu-history-popover__clear-confirmation"
              role="alertdialog"
              aria-label="确认清空查询历史"
            >
              <span>确定清空全部查询历史吗？</span>
              <div>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(false)}
                >
                  取消
                </button>
                <button
                  className="mod-warning"
                  type="button"
                  onClick={() => {
                    actions.clearHistory();
                    setIsConfirmingClear(false);
                  }}
                >
                  确认清空
                </button>
              </div>
            </div>
          )}
          {entries.length === 0 ? (
            <div className="zhihu-history-popover__empty">
              暂无查询过的问题
            </div>
          ) : (
            <ul aria-label="最近查询的问题">
              {entries.map((entry) => (
                <li key={entry.questionId}>
                  <button
                    className="zhihu-history-popover__title"
                    type="button"
                    disabled={!canOpenEntries}
                    onClick={() => actions.openHistoryEntry(entry.questionId)}
                    title={
                      canOpenEntries
                        ? entry.questionTitle
                        : "登录知乎后重新打开该问题"
                    }
                  >
                    <span className="zhihu-history-popover__content">
                      <strong>{entry.questionTitle}</strong>
                      <small>
                        <time
                          dateTime={entry.lastQueriedAt}
                          title={formatFullHistoryDate(entry.lastQueriedAt)}
                        >
                          {formatHistoryDate(entry.lastQueriedAt)}
                        </time>
                      </small>
                    </span>
                  </button>
                  <button
                    className="zhihu-history-popover__remove"
                    type="button"
                    onClick={() => actions.removeHistoryEntry(entry.questionId)}
                    aria-label={`删除历史：${entry.questionTitle}`}
                    title="从历史中删除"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const historyTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const historyMonthDayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
});

const historyYearDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const historyFullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatHistoryDate(
  value: string,
  now = new Date(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  const today = startOfLocalDay(now);
  const queriedDay = startOfLocalDay(date);
  const dayDifference = Math.round(
    (today.getTime() - queriedDay.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dayDifference === 0) {
    return `今天 ${historyTimeFormatter.format(date)}`;
  }
  if (dayDifference === 1) {
    return `昨天 ${historyTimeFormatter.format(date)}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return historyMonthDayFormatter.format(date);
  }
  return historyYearDateFormatter.format(date);
}

function formatFullHistoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "查询时间未知"
    : historyFullDateFormatter.format(date);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
