import { describe, expect, it } from "vitest";

import { AnswerCommentList } from "@/comments/AnswerCommentList";
import type {
  CommentPage,
  ZhihuComment,
} from "@/domain/zhihu";
import type { ZhihuGateway } from "@/zhihu/gateway";
import type {
  FetchAnswerCommentsOptions,
  FetchChildCommentsOptions,
} from "@/zhihu/urls";

describe("AnswerCommentList", () => {
  it("loads comments on demand and reuses the current answer", async () => {
    const gateway = commentGateway([page([comment("1")], true)]);
    const list = new AnswerCommentList(gateway);

    await list.showAnswer("100");
    await list.showAnswer("100");

    expect(gateway.rootRequests).toEqual([{
      answerId: "100",
      options: { limit: 10, order: "score" },
    }]);
    expect(list.snapshot()).toMatchObject({
      phase: "ready",
      answerId: "100",
      comments: [{ id: "1" }],
      isEnd: true,
    });
  });

  it("follows paging.next, deduplicates comments and reloads on sort change", async () => {
    const next =
      "https://www.zhihu.com/api/v4/comment_v5/answers/100/root_comment?offset=10";
    const gateway = commentGateway([
      page([comment("1"), comment("2")], false, next),
      page([comment("2"), comment("3")], true),
      page([comment("4")], true),
    ]);
    const list = new AnswerCommentList(gateway);

    await list.showAnswer("100");
    await list.loadMore();
    await list.changeOrder("time");

    expect(gateway.rootRequests[1]?.options.pageUrl).toBe(next);
    expect(gateway.rootRequests[2]?.options.order).toBe("time");
    expect(list.snapshot()).toMatchObject({
      order: "time",
      comments: [{ id: "4" }],
    });
  });

  it("loads all child replies only when the thread is expanded", async () => {
    const preview = comment("11");
    const root = comment("1", { childCommentCount: 2, childComments: [preview] });
    const gateway = commentGateway(
      [page([root], true)],
      [page([preview, comment("12")], true)],
    );
    const list = new AnswerCommentList(gateway);

    await list.showAnswer("100");
    expect(gateway.childRequests).toHaveLength(0);
    await list.toggleReplies(root);

    expect(gateway.childRequests).toEqual([{
      commentId: "1",
      options: { limit: 10 },
    }]);
    expect(list.snapshot().replies["1"]).toMatchObject({
      phase: "ready",
      isExpanded: true,
      comments: [{ id: "11" }, { id: "12" }],
      isEnd: true,
    });

    await list.toggleReplies(root);
    await list.toggleReplies(root);
    expect(gateway.childRequests).toHaveLength(1);
    expect(list.snapshot().replies["1"]?.isExpanded).toBe(true);
  });

  it("keeps loaded comments when the next page fails and retries it", async () => {
    const next =
      "https://www.zhihu.com/api/v4/comment_v5/answers/100/root_comment?offset=10";
    const gateway = commentGateway([
      page([comment("1")], false, next),
      new Error("下一页评论暂时不可用"),
      page([comment("2")], true),
    ]);
    const list = new AnswerCommentList(gateway);

    await list.showAnswer("100");
    await list.loadMore();
    expect(list.snapshot()).toMatchObject({
      phase: "ready",
      comments: [{ id: "1" }],
      errorMessage: "下一页评论暂时不可用",
    });
    await list.retry();

    expect(list.snapshot()).toMatchObject({
      comments: [{ id: "1" }, { id: "2" }],
      errorMessage: null,
      isEnd: true,
    });
  });

  it("retries the first child page while preserving preview replies", async () => {
    const preview = comment("11");
    const root = comment("1", { childCommentCount: 2, childComments: [preview] });
    const gateway = commentGateway(
      [page([root], true)],
      [new Error("回复暂时不可用"), page([preview, comment("12")], true)],
    );
    const list = new AnswerCommentList(gateway);

    await list.showAnswer("100");
    await list.toggleReplies(root);
    expect(list.snapshot().replies["1"]).toMatchObject({
      phase: "ready",
      comments: [{ id: "11" }],
      errorMessage: "回复暂时不可用",
    });
    await list.retryReplies("1");

    expect(gateway.childRequests).toHaveLength(2);
    expect(list.snapshot().replies["1"]).toMatchObject({
      comments: [{ id: "11" }, { id: "12" }],
      errorMessage: null,
      isEnd: true,
    });
  });

  it("ignores comments returned after switching to another answer", async () => {
    const first = deferred<CommentPage>();
    const gateway = commentGateway([
      first.promise,
      page([comment("2")], true),
    ]);
    const list = new AnswerCommentList(gateway);

    const firstRequest = list.showAnswer("100");
    await list.showAnswer("200");
    first.resolve(page([comment("1")], true));
    await firstRequest;

    expect(list.snapshot()).toMatchObject({
      answerId: "200",
      comments: [{ id: "2" }],
    });
  });
});

function comment(
  id: string,
  overrides: Partial<ZhihuComment> = {},
): ZhihuComment {
  return {
    id,
    author: { name: `作者 ${id}`, headline: "" },
    contentHtml: `<p>评论 ${id}</p>`,
    likeCount: 0,
    childCommentCount: 0,
    childComments: [],
    isAnswerAuthor: false,
    isTop: false,
    ...overrides,
  };
}

function page(
  comments: readonly ZhihuComment[],
  isEnd: boolean,
  nextPageUrl: string | null = null,
): CommentPage {
  return { comments, isEnd, nextPageUrl };
}

function commentGateway(
  rootResults: Array<CommentPage | Error | Promise<CommentPage>>,
  childResults: Array<CommentPage | Error | Promise<CommentPage>> = [],
): ZhihuGateway & {
  rootRequests: Array<{
    answerId: string;
    options: FetchAnswerCommentsOptions;
  }>;
  childRequests: Array<{
    commentId: string;
    options: FetchChildCommentsOptions;
  }>;
} {
  let rootIndex = 0;
  let childIndex = 0;
  return {
    rootRequests: [],
    childRequests: [],
    getAnswerCommentPage(answerId, options = {}) {
      this.rootRequests.push({ answerId, options });
      const result = rootResults[rootIndex];
      rootIndex += 1;
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result ?? page([], true));
    },
    getChildCommentPage(commentId, options = {}) {
      this.childRequests.push({ commentId, options });
      const result = childResults[childIndex];
      childIndex += 1;
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result ?? page([], true));
    },
    getSearchAnswerPage: () => Promise.reject(new Error("Not used")),
    getQuestion: () => Promise.reject(new Error("Not used")),
    getAnswer: () => Promise.reject(new Error("Not used")),
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
