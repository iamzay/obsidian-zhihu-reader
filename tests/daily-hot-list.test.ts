import { describe, expect, it } from "vitest";

import type { ZhihuHotListItem } from "@/domain/zhihu";
import { DailyHotList } from "@/hotlist/DailyHotList";
import {
  ZhihuGatewayError,
  type ZhihuGateway,
} from "@/zhihu/gateway";

describe("DailyHotList", () => {
  it("loads the list and reuses it within the cache window", async () => {
    const gateway = hotListGateway([item("1")]);
    const hotList = new DailyHotList(
      gateway,
      () => new Date("2026-07-16T08:00:00.000Z"),
    );

    await hotList.load();
    await hotList.load();

    expect(gateway.requests).toBe(1);
    expect(hotList.snapshot()).toMatchObject({
      phase: "ready",
      items: [{ questionId: "1" }],
      loadedAt: "2026-07-16T08:00:00.000Z",
    });
  });

  it("merges concurrent loads and supports an explicit refresh", async () => {
    const gateway = hotListGateway([item("1")]);
    const hotList = new DailyHotList(gateway);

    await Promise.all([hotList.load(), hotList.load(), hotList.load()]);
    await hotList.load(true);

    expect(gateway.requests).toBe(2);
  });

  it("keeps a readable error and retries", async () => {
    let shouldFail = true;
    const gateway = hotListGateway([item("1")], () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("每日热榜需要登录知乎");
      }
    });
    const hotList = new DailyHotList(gateway);

    await hotList.load();
    expect(hotList.snapshot()).toMatchObject({
      phase: "error",
      errorMessage: "每日热榜需要登录知乎",
      errorKind: "request",
    });
    await hotList.load(true);

    expect(hotList.snapshot().phase).toBe("ready");
  });

  it("distinguishes authentication failures from other request errors", async () => {
    const gateway = hotListGateway([], () => {
      throw new ZhihuGatewayError("forbidden", "身份未经过验证");
    });
    const hotList = new DailyHotList(gateway);

    await hotList.load();

    expect(hotList.snapshot()).toMatchObject({
      phase: "error",
      errorKind: "authentication",
    });
  });
});

function hotListGateway(
  items: readonly ZhihuHotListItem[],
  beforeRequest: () => void = () => undefined,
): ZhihuGateway & { requests: number } {
  return {
    requests: 0,
    getHotList() {
      this.requests += 1;
      try {
        beforeRequest();
        return Promise.resolve(items);
      } catch (error: unknown) {
        return Promise.reject(
          error instanceof Error ? error : new Error("Unknown fixture error"),
        );
      }
    },
    getQuestion: () => Promise.reject(new Error("Not used")),
    getAnswer: () => Promise.reject(new Error("Not used")),
    getAnswerCommentPage: () => Promise.reject(new Error("Not used")),
    getChildCommentPage: () => Promise.reject(new Error("Not used")),
    getAuthorAnswerPage: () => Promise.reject(new Error("Not used")),
    getAnswerPage: () => Promise.reject(new Error("Not used")),
  };
}

function item(questionId: string): ZhihuHotListItem {
  return {
    rank: 1,
    questionId,
    title: `热榜问题 ${questionId}`,
    excerpt: "热榜摘要",
    heatLabel: "100 万热度",
    answerCount: 10,
    followerCount: 20,
  };
}
