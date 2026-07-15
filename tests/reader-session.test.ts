import { describe, expect, it } from "vitest";

import type {
  AnswerDocument,
  AnswerPage,
  QuestionSummary,
} from "@/domain/zhihu";
import { ReaderSession } from "@/reader/ReaderSession";
import type { ZhihuGateway } from "@/zhihu/gateway";
import type { FetchQuestionAnswersOptions } from "@/zhihu/urls";

const question: QuestionSummary = {
  id: "100",
  title: "测试问题",
  url: "https://www.zhihu.com/question/100",
  detailHtml: "<p>问题描述</p>",
  excerpt: "问题描述",
  topics: [{ id: "1", name: "测试" }],
  answerCount: 20,
  followerCount: 30,
};

class FakeGateway implements ZhihuGateway {
  readonly pageRequests: Array<{
    questionId: string;
    options: FetchQuestionAnswersOptions;
  }> = [];
  private pageIndex = 0;

  constructor(
    private readonly pages: Array<
      () => AnswerPage | Promise<AnswerPage>
    >,
    private readonly anchor = answer("99"),
  ) {}

  getQuestion(): Promise<QuestionSummary> {
    return Promise.resolve(question);
  }

  getAnswer(): Promise<AnswerDocument> {
    return Promise.resolve(this.anchor);
  }

  async getAnswerPage(
    questionId: string,
    options: FetchQuestionAnswersOptions = {},
  ): Promise<AnswerPage> {
    this.pageRequests.push({ questionId, options });
    const page = this.pages[this.pageIndex];
    this.pageIndex += 1;
    if (page === undefined) {
      throw new Error("Unexpected page request");
    }
    return await page();
  }
}

describe("ReaderSession question mode", () => {
  it("uses six answers, navigates the cached batch, then follows paging.next", async () => {
    const gateway = new FakeGateway([
      () => page(["1", "2", "3", "4", "5", "6"], false, pageUrl(6)),
      () => page(["7", "8"], true),
    ]);
    const session = new ReaderSession(gateway, () => ({
      feedLimit: 6,
      order: "default",
    }));

    await session.open({ type: "question", questionId: "100" });
    expect(session.snapshot().currentIndex).toBe(0);
    expect(gateway.pageRequests[0]).toMatchObject({
      questionId: "100",
      options: { limit: 6, order: "default" },
    });

    for (let index = 0; index < 5; index += 1) {
      await session.next();
    }
    expect(session.snapshot().currentIndex).toBe(5);
    expect(gateway.pageRequests).toHaveLength(1);

    await Promise.all([session.next(), session.next(), session.next()]);
    expect(gateway.pageRequests).toHaveLength(2);
    expect(gateway.pageRequests[1]?.options.pageUrl).toBe(pageUrl(6));
    expect(session.snapshot().currentIndex).toBe(6);

    session.previous();
    expect(session.snapshot().currentIndex).toBe(5);
  });

  it("keeps the loaded question visible when a later page fails", async () => {
    const gateway = new FakeGateway([
      () => page(["1"], false, pageUrl(1)),
      () => {
        throw new Error("下一页失败");
      },
    ]);
    const session = new ReaderSession(gateway, () => ({
      feedLimit: 6,
      order: "default",
    }));

    await session.open({ type: "question", questionId: "100" });
    await session.next();

    expect(session.snapshot()).toMatchObject({
      phase: "ready",
      currentIndex: 0,
      navigationError: "下一页失败",
    });
  });

  it("retries a failed later page without replacing the current answer", async () => {
    const gateway = new FakeGateway([
      () => page(["1"], false, pageUrl(1)),
      () => {
        throw new Error("下一页失败");
      },
      () => page(["2"], true),
    ]);
    const session = new ReaderSession(gateway, () => ({
      feedLimit: 6,
      order: "default",
    }));

    await session.open({ type: "question", questionId: "100" });
    await session.next();
    await session.retryNavigation();

    expect(session.snapshot().navigationError).toBeNull();
    expect(session.snapshot().answers.map(({ id }) => id)).toEqual(["1", "2"]);
    expect(session.snapshot().currentIndex).toBe(0);
  });
});

describe("ReaderSession anchor mode", () => {
  it("shows the anchor before the feed resolves and removes duplicates", async () => {
    const pending = deferred<AnswerPage>();
    const gateway = new FakeGateway([() => pending.promise]);
    const session = new ReaderSession(gateway, () => ({
      feedLimit: 6,
      order: "default",
    }));

    const opening = session.open({
      type: "answer",
      questionId: "100",
      answerId: "99",
    });
    await until(() => session.snapshot().phase === "ready");
    expect(session.snapshot()).toMatchObject({
      currentIndex: 0,
      anchorAnswerId: "99",
      isLoadingNextPage: true,
    });
    expect(session.snapshot().answers.map(({ id }) => id)).toEqual(["99"]);

    pending.resolve(page(["99", "1", "2", "3", "4", "5"], false, pageUrl(6)));
    await opening;
    expect(session.snapshot().answers.map(({ id }) => id)).toEqual([
      "99",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(gateway.pageRequests[0]?.options.limit).toBe(6);
  });

  it("returns to the anchor and keeps it fixed when sorting changes", async () => {
    const gateway = new FakeGateway([
      () => page(["1", "2"], true),
      () => page(["7", "8"], true),
    ]);
    const session = new ReaderSession(gateway, () => ({
      feedLimit: 6,
      order: "default",
    }));

    await session.open({ type: "answer", answerId: "99", questionId: "100" });
    await session.next();
    expect(session.snapshot().currentIndex).toBe(1);
    session.returnToAnchor();
    expect(session.snapshot().currentIndex).toBe(0);

    await session.changeOrder("updated");
    expect(session.snapshot().answers.map(({ id }) => id)).toEqual([
      "99",
      "7",
      "8",
    ]);
    expect(gateway.pageRequests[1]?.options.order).toBe("updated");
  });

  it("keeps the anchor readable when background feed loading fails", async () => {
    const gateway = new FakeGateway([
      () => {
        throw new Error("feed unavailable");
      },
    ]);
    const session = new ReaderSession(gateway, () => ({
      feedLimit: 6,
      order: "default",
    }));

    await session.open({ type: "answer", answerId: "99", questionId: "100" });

    expect(session.snapshot()).toMatchObject({
      phase: "ready",
      currentIndex: 0,
      navigationError: "feed unavailable",
    });
    expect(session.snapshot().answers.map(({ id }) => id)).toEqual(["99"]);
  });

  it("deduplicates the anchor and prior answers across later pages", async () => {
    const gateway = new FakeGateway([
      () => page(["1"], false, pageUrl(1)),
      () => page(["99", "1", "2"], true),
    ]);
    const session = new ReaderSession(gateway, () => ({
      feedLimit: 6,
      order: "default",
    }));

    await session.open({ type: "answer", answerId: "99", questionId: "100" });
    await session.next();
    await session.next();

    expect(session.snapshot().answers.map(({ id }) => id)).toEqual([
      "99",
      "1",
      "2",
    ]);
  });
});

function answer(id: string): AnswerDocument {
  return {
    id,
    url: `https://www.zhihu.com/question/100/answer/${id}`,
    author: { name: `作者 ${id}`, headline: "" },
    contentHtml: `<p>回答 ${id}</p>`,
    excerpt: `回答 ${id}`,
    voteupCount: Number(id),
    commentCount: 0,
    question,
  };
}

function page(
  ids: string[],
  isEnd: boolean,
  nextPageUrl: string | null = null,
): AnswerPage {
  return {
    answers: ids.map(answer),
    isEnd,
    nextPageUrl,
    previousPageUrl: null,
  };
}

function pageUrl(offset: number): string {
  return `https://www.zhihu.com/api/v4/questions/100/feeds?limit=6&offset=${offset}`;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("Condition was not reached");
}
