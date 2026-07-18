import { describe, expect, it } from "vitest";

import type {
  RecommendationPage,
  ZhihuRecommendationItem,
} from "@/domain/zhihu";
import { RecommendationFeed } from "@/recommendation/RecommendationFeed";
import {
  ZhihuGatewayError,
  type ZhihuGateway,
} from "@/zhihu/gateway";
import type { FetchRecommendationsOptions } from "@/zhihu/urls";

describe("RecommendationFeed", () => {
  it("loads, deduplicates and paginates recommendations", async () => {
    const gateway = recommendationGateway([
      page([item("answer:1"), item("answer:2")], false, nextUrl(10)),
      page([item("answer:2"), item("answer:3")], true),
    ]);
    const feed = new RecommendationFeed(gateway);

    await feed.load();
    await feed.loadMore();

    expect(feed.snapshot()).toMatchObject({ phase: "ready", isEnd: true });
    expect(feed.snapshot().items.map(({ id }) => id)).toEqual([
      "answer:1",
      "answer:2",
      "answer:3",
    ]);
    expect(gateway.requests[1]?.pageUrl).toBe(nextUrl(10));
  });

  it("keeps loaded recommendations when pagination fails and retries", async () => {
    const gateway = recommendationGateway([
      page([item("answer:1")], false, nextUrl(10)),
      new Error("下一页失败"),
      page([item("answer:2")], true),
    ]);
    const feed = new RecommendationFeed(gateway);

    await feed.load();
    await feed.loadMore();
    expect(feed.snapshot()).toMatchObject({
      phase: "ready",
      errorMessage: "下一页失败",
    });

    await feed.retry();
    expect(feed.snapshot().items.map(({ id }) => id)).toEqual([
      "answer:1",
      "answer:2",
    ]);
  });

  it("refreshes the first page and replaces previous items", async () => {
    const gateway = recommendationGateway([
      page([item("answer:1")], true),
      page([item("answer:9")], true),
    ]);
    const feed = new RecommendationFeed(gateway);

    await feed.load();
    await feed.load(true);

    expect(feed.snapshot().items.map(({ id }) => id)).toEqual(["answer:9"]);
  });

  it("retries a failed refresh as a new first-page request", async () => {
    const gateway = recommendationGateway([
      page([item("answer:1")], false, nextUrl(10)),
      new Error("刷新失败"),
      page([item("answer:9")], true),
    ]);
    const feed = new RecommendationFeed(gateway);

    await feed.load();
    await feed.load(true);
    await feed.retry();

    expect(feed.snapshot().items.map(({ id }) => id)).toEqual(["answer:9"]);
    expect(gateway.requests[2]?.pageUrl).toBeUndefined();
  });

  it("classifies authentication failures", async () => {
    const gateway = recommendationGateway([
      new ZhihuGatewayError("forbidden", "身份未经过验证"),
    ]);
    const feed = new RecommendationFeed(gateway);

    await feed.load();

    expect(feed.snapshot()).toMatchObject({
      phase: "error",
      errorKind: "authentication",
    });
  });
});

function recommendationGateway(
  responses: readonly (RecommendationPage | Error)[],
): ZhihuGateway & { requests: FetchRecommendationsOptions[] } {
  let index = 0;
  return {
    requests: [],
    getRecommendationPage(options = {}) {
      this.requests.push(options);
      const response = responses[index++];
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response ?? page([], true));
    },
    getQuestion: () => Promise.reject(new Error("Not used")),
    getAnswer: () => Promise.reject(new Error("Not used")),
    setAnswerVote: () => Promise.reject(new Error("Not used")),
    getSearchAnswerPage: () => Promise.reject(new Error("Not used")),
    getAnswerCommentPage: () => Promise.reject(new Error("Not used")),
    getChildCommentPage: () => Promise.reject(new Error("Not used")),
    getAuthorAnswerPage: () => Promise.reject(new Error("Not used")),
    getAnswerPage: () => Promise.reject(new Error("Not used")),
    getHotList: () => Promise.reject(new Error("Not used")),
  };
}

function page(
  items: readonly ZhihuRecommendationItem[],
  isEnd: boolean,
  nextPageUrl: string | null = null,
): RecommendationPage {
  return { items, isEnd, nextPageUrl };
}

function item(id: string): ZhihuRecommendationItem {
  const answerId = id.split(":")[1] ?? "1";
  return {
    id,
    target: { type: "answer", answerId, questionId: "100" },
    title: `推荐 ${id}`,
    excerpt: "推荐摘要",
    voteupCount: 10,
    commentCount: 2,
    reason: "为你推荐",
  };
}

function nextUrl(offset: number): string {
  return `https://www.zhihu.com/api/v3/feed/topstory/recommend?desktop=true&limit=10&offset=${offset}`;
}
