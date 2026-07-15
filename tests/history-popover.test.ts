import { describe, expect, it } from "vitest";

import { formatHistoryDate } from "@/view/reader/HistoryPopover";

describe("formatHistoryDate", () => {
  const now = new Date(2026, 6, 16, 12, 0);

  it("shows useful relative labels for recent history", () => {
    expect(
      formatHistoryDate(new Date(2026, 6, 16, 9, 5).toISOString(), now),
    ).toBe("今天 09:05");
    expect(
      formatHistoryDate(new Date(2026, 6, 15, 18, 30).toISOString(), now),
    ).toBe("昨天 18:30");
  });

  it("shows a calendar date for older history", () => {
    expect(
      formatHistoryDate(new Date(2026, 6, 14, 18, 30).toISOString(), now),
    ).toBe("7月14日");
    expect(
      formatHistoryDate(new Date(2025, 11, 31, 18, 30).toISOString(), now),
    ).toBe("2025年12月31日");
  });

  it("handles invalid persisted dates", () => {
    expect(formatHistoryDate("invalid", now)).toBe("时间未知");
  });
});
