import { describe, expect, it } from "vitest";

import type { QuestionSummary } from "@/domain/zhihu";
import {
  QuestionHistory,
  type QuestionHistoryEntry,
  type QuestionHistoryPersistence,
} from "@/history/QuestionHistory";

class MemoryPersistence implements QuestionHistoryPersistence {
  saves: readonly QuestionHistoryEntry[][] = [];
  failNext = false;

  save(entries: readonly QuestionHistoryEntry[]): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("disk unavailable"));
    }
    this.saves = [...this.saves, entries.map((entry) => ({ ...entry }))];
    return Promise.resolve();
  }
}

describe("QuestionHistory", () => {
  it("deduplicates by question id, moves a repeated query first and trims", async () => {
    const persistence = new MemoryPersistence();
    const clock = sequenceClock([
      "2026-07-15T01:00:00.000Z",
      "2026-07-15T02:00:00.000Z",
      "2026-07-15T03:00:00.000Z",
    ]);
    const history = new QuestionHistory(
      [],
      { limit: 2 },
      persistence,
      clock,
    );

    await history.record(question("1", "问题一"));
    await history.record(question("2", "问题二"));
    await history.record(question("1", "问题一（新标题）"));

    expect(history.list()).toEqual([
      {
        questionId: "1",
        questionTitle: "问题一（新标题）",
        lastQueriedAt: "2026-07-15T03:00:00.000Z",
      },
      {
        questionId: "2",
        questionTitle: "问题二",
        lastQueriedAt: "2026-07-15T02:00:00.000Z",
      },
    ]);
  });

  it("removes and clears only history entries", async () => {
    const persistence = new MemoryPersistence();
    const history = new QuestionHistory(
      [
        entry("1", "问题一", "2026-07-15T02:00:00.000Z"),
        entry("2", "问题二", "2026-07-15T01:00:00.000Z"),
      ],
      { limit: 50 },
      persistence,
    );

    await history.remove("1");
    expect(history.list().map(({ questionId }) => questionId)).toEqual(["2"]);
    await history.clear();
    expect(history.list()).toEqual([]);
  });

  it("keeps failed writes in memory and includes them in the next save", async () => {
    const persistence = new MemoryPersistence();
    const history = new QuestionHistory(
      [],
      { limit: 50 },
      persistence,
      sequenceClock([
        "2026-07-15T01:00:00.000Z",
        "2026-07-15T02:00:00.000Z",
      ]),
    );
    persistence.failNext = true;

    await expect(history.record(question("1", "问题一"))).rejects.toThrow(
      "disk unavailable",
    );
    await history.record(question("2", "问题二"));

    expect(persistence.saves.at(-1)?.map(({ questionId }) => questionId)).toEqual([
      "2",
      "1",
    ]);
  });
});

function question(id: string, title: string): QuestionSummary {
  return {
    id,
    title,
    url: `https://www.zhihu.com/question/${id}`,
    detailHtml: "",
    excerpt: "",
    topics: [],
    answerCount: 0,
    followerCount: 0,
  };
}

function entry(
  questionId: string,
  questionTitle: string,
  lastQueriedAt: string,
): QuestionHistoryEntry {
  return { questionId, questionTitle, lastQueriedAt };
}

function sequenceClock(values: string[]): () => Date {
  let index = 0;
  return () => {
    const value = values[index++] ?? values.at(-1);
    if (value === undefined) {
      throw new Error("Clock sequence is empty");
    }
    return new Date(value);
  };
}
