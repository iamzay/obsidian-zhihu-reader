import { describe, expect, it } from "vitest";

import type {
  AuthorAnswerPage,
  AuthorAnswerSummary,
  ZhihuAuthor,
} from "@/domain/zhihu";
import { AuthorAnswerList } from "@/author/AuthorAnswerList";
import type { ZhihuGateway } from "@/zhihu/gateway";
import type { FetchAuthorAnswersOptions } from "@/zhihu/urls";

const author: ZhihuAuthor = {
  id: "author-id",
  urlToken: "author-token",
  name: "示例作者",
  headline: "",
};

describe("AuthorAnswerList", () => {
  it("loads on demand and reuses the current author's first page", async () => {
    const gateway = authorGateway([page([answer("1")], true)]);
    const list = new AuthorAnswerList(gateway);

    await list.showAuthor(author);
    await list.showAuthor(author);

    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0]).toMatchObject({
      identifier: "author-token",
      options: { limit: 10 },
    });
    expect(list.snapshot()).toMatchObject({
      phase: "ready",
      authorName: "示例作者",
      answers: [{ answerId: "1" }],
      isEnd: true,
    });
  });

  it("follows paging.next and removes duplicate answers", async () => {
    const nextUrl =
      "https://www.zhihu.com/api/v4/members/author-token/answers?offset=10";
    const gateway = authorGateway([
      page([answer("1"), answer("2")], false, nextUrl),
      page([answer("2"), answer("3")], true),
    ]);
    const list = new AuthorAnswerList(gateway);

    await list.showAuthor(author);
    await list.loadMore();

    expect(gateway.requests[1]?.options.pageUrl).toBe(nextUrl);
    expect(list.snapshot().answers.map(({ answerId }) => answerId)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("keeps loaded answers when a later page fails and supports retry", async () => {
    const nextUrl =
      "https://www.zhihu.com/api/v4/members/author-token/answers?offset=10";
    const gateway = authorGateway([
      page([answer("1")], false, nextUrl),
      new Error("下一页暂时不可用"),
      page([answer("2")], true),
    ]);
    const list = new AuthorAnswerList(gateway);

    await list.showAuthor(author);
    await list.loadMore();
    expect(list.snapshot()).toMatchObject({
      phase: "ready",
      answers: [{ answerId: "1" }],
      errorMessage: "下一页暂时不可用",
    });
    await list.retry();

    expect(list.snapshot()).toMatchObject({
      answers: [{ answerId: "1" }, { answerId: "2" }],
      isEnd: true,
      errorMessage: null,
    });
  });

  it("ignores an older author's response after switching authors", async () => {
    const first = deferred<AuthorAnswerPage>();
    const gateway = authorGateway([
      first.promise,
      page([answer("2")], true),
    ]);
    const list = new AuthorAnswerList(gateway);

    const firstRequest = list.showAuthor(author);
    await list.showAuthor({
      id: "second-id",
      urlToken: "second-token",
      name: "第二位作者",
      headline: "",
    });
    first.resolve(page([answer("1")], true));
    await firstRequest;

    expect(list.snapshot()).toMatchObject({
      authorIdentifier: "second-token",
      authorName: "第二位作者",
      answers: [{ answerId: "2" }],
    });
  });
});

function authorGateway(
  results: Array<AuthorAnswerPage | Error | Promise<AuthorAnswerPage>>,
): ZhihuGateway & {
  requests: Array<{
    identifier: string;
    options: FetchAuthorAnswersOptions;
  }>;
} {
  let index = 0;
  return {
    requests: [],
    getAuthorAnswerPage(identifier, options = {}) {
      this.requests.push({ identifier, options });
      const result = results[index];
      index += 1;
      if (result instanceof Error) {
        return Promise.reject(result);
      }
      return Promise.resolve(result ?? page([], true));
    },
    getQuestion: () => Promise.reject(new Error("Not used")),
    getAnswer: () => Promise.reject(new Error("Not used")),
    getSearchAnswerPage: () => Promise.reject(new Error("Not used")),
    getAnswerCommentPage: () => Promise.reject(new Error("Not used")),
    getChildCommentPage: () => Promise.reject(new Error("Not used")),
    getAnswerPage: () => Promise.reject(new Error("Not used")),
    getHotList: () => Promise.reject(new Error("Not used")),
  };
}

function page(
  answers: readonly AuthorAnswerSummary[],
  isEnd: boolean,
  nextPageUrl: string | null = null,
): AuthorAnswerPage {
  return { answers, isEnd, nextPageUrl };
}

function answer(answerId: string): AuthorAnswerSummary {
  return {
    answerId,
    questionId: `question-${answerId}`,
    questionTitle: `问题 ${answerId}`,
    excerpt: `回答摘要 ${answerId}`,
    voteupCount: 1,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return {
    promise,
    resolve(value) {
      resolve?.(value);
    },
  };
}
