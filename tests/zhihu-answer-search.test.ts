import { describe, expect, it } from "vitest";

import type {
  SearchAnswerPage,
  SearchAnswerResult,
} from "@/domain/zhihu";
import { ZhihuAnswerSearch } from "@/search/ZhihuAnswerSearch";
import {
  ZhihuGatewayError,
  type ZhihuGateway,
} from "@/zhihu/gateway";
import type { FetchSearchAnswersOptions } from "@/zhihu/urls";

describe("ZhihuAnswerSearch", () => {
  it("searches a trimmed query and reuses its loaded first page", async () => {
    const gateway = searchGateway([page([result("1")], true)]);
    const search = new ZhihuAnswerSearch(gateway);

    await search.search("  Obsidian  ");
    await search.search("Obsidian");

    expect(gateway.requests).toEqual([{
      query: "Obsidian",
      options: { limit: 20 },
    }]);
    expect(search.snapshot()).toMatchObject({
      phase: "ready",
      query: "Obsidian",
      results: [{ answerId: "1" }],
      isEnd: true,
    });
  });

  it("follows paging.next and removes duplicate answers", async () => {
    const next =
      "https://www.zhihu.com/api/v4/search_v3?q=Obsidian&offset=20";
    const gateway = searchGateway([
      page([result("1"), result("2")], false, next),
      page([result("2"), result("3")], true),
    ]);
    const search = new ZhihuAnswerSearch(gateway);

    await search.search("Obsidian");
    await search.loadMore();

    expect(gateway.requests[1]?.options.pageUrl).toBe(next);
    expect(search.snapshot().results.map(({ answerId }) => answerId)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("preserves results after a pagination failure and retries", async () => {
    const next =
      "https://www.zhihu.com/api/v4/search_v3?q=Obsidian&offset=20";
    const gateway = searchGateway([
      page([result("1")], false, next),
      new Error("下一页搜索结果暂时不可用"),
      page([result("2")], true),
    ]);
    const search = new ZhihuAnswerSearch(gateway);

    await search.search("Obsidian");
    await search.loadMore();
    expect(search.snapshot()).toMatchObject({
      phase: "ready",
      results: [{ answerId: "1" }],
      errorMessage: "下一页搜索结果暂时不可用",
    });
    await search.retry();

    expect(search.snapshot()).toMatchObject({
      results: [{ answerId: "1" }, { answerId: "2" }],
      errorMessage: null,
      isEnd: true,
    });
  });

  it("ignores an older response after starting a different query", async () => {
    const first = deferred<SearchAnswerPage>();
    const gateway = searchGateway([
      first.promise,
      page([result("2")], true),
    ]);
    const search = new ZhihuAnswerSearch(gateway);

    const firstRequest = search.search("first");
    await search.search("second");
    first.resolve(page([result("1")], true));
    await firstRequest;

    expect(search.snapshot()).toMatchObject({
      query: "second",
      results: [{ answerId: "2" }],
    });
  });

  it("classifies the anonymous search response as an authentication error", async () => {
    const gateway = searchGateway([
      new ZhihuGatewayError("response", "知乎接口返回异常状态 400。"),
    ]);
    const search = new ZhihuAnswerSearch(gateway);

    await search.search("Obsidian");

    expect(search.snapshot()).toMatchObject({
      phase: "error",
      errorKind: "authentication",
    });
  });
});

function result(answerId: string): SearchAnswerResult {
  return {
    answerId,
    questionId: `question-${answerId}`,
    questionTitle: `问题 ${answerId}`,
    excerpt: `回答摘要 ${answerId}`,
    author: { name: `作者 ${answerId}`, headline: "" },
    voteupCount: 1,
    commentCount: 0,
  };
}

function page(
  results: readonly SearchAnswerResult[],
  isEnd: boolean,
  nextPageUrl: string | null = null,
): SearchAnswerPage {
  return { results, isEnd, nextPageUrl };
}

function searchGateway(
  results: Array<SearchAnswerPage | Error | Promise<SearchAnswerPage>>,
): ZhihuGateway & {
  requests: Array<{
    query: string;
    options: FetchSearchAnswersOptions;
  }>;
} {
  let index = 0;
  return {
    requests: [],
    getSearchAnswerPage(query, options = {}) {
      this.requests.push({ query, options });
      const response = results[index];
      index += 1;
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response ?? page([], true));
    },
    getQuestion: () => Promise.reject(new Error("Not used")),
    getAnswer: () => Promise.reject(new Error("Not used")),
    getAnswerCommentPage: () => Promise.reject(new Error("Not used")),
    getChildCommentPage: () => Promise.reject(new Error("Not used")),
    getAuthorAnswerPage: () => Promise.reject(new Error("Not used")),
    getAnswerPage: () => Promise.reject(new Error("Not used")),
    getHotList: () => Promise.reject(new Error("Not used")),
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}
