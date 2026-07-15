import { describe, expect, it, vi } from "vitest";

import type {
  AnswerDocument,
  AnswerVoteResult,
} from "@/domain/zhihu";
import { AnswerVoteController } from "@/vote/AnswerVoteController";

describe("AnswerVoteController", () => {
  it("updates optimistically, merges duplicate clicks and accepts the server count", async () => {
    const response = deferred<AnswerVoteResult>();
    const setAnswerVote = vi.fn(() => response.promise);
    const controller = new AnswerVoteController({ setAnswerVote });
    const current = answer("1", false, 10);

    const first = controller.toggle(current);
    const duplicate = controller.toggle(current);

    expect(duplicate).toBe(first);
    expect(setAnswerVote).toHaveBeenCalledTimes(0);
    expect(controller.snapshot(current)).toEqual({
      isVoted: true,
      voteupCount: 11,
      isSubmitting: true,
      errorMessage: null,
    });

    response.resolve({ isVoted: true, voteupCount: 12 });
    await first;

    expect(setAnswerVote).toHaveBeenCalledWith("1", true);
    expect(setAnswerVote).toHaveBeenCalledTimes(1);
    expect(controller.snapshot(current)).toEqual({
      isVoted: true,
      voteupCount: 12,
      isSubmitting: false,
      errorMessage: null,
    });
  });

  it("rolls back an optimistic vote when the request fails", async () => {
    const controller = new AnswerVoteController({
      setAnswerVote: () => Promise.reject(new Error("登录已失效，请重新登录。")),
    });
    const current = answer("1", false, 10);

    await controller.toggle(current);

    expect(controller.snapshot(current)).toEqual({
      isVoted: false,
      voteupCount: 10,
      isSubmitting: false,
      errorMessage: "登录已失效，请重新登录。",
    });
  });

  it("cancels an existing vote without affecting another answer", async () => {
    const setAnswerVote = vi.fn((answerId: string, isVoted: boolean) =>
      Promise.resolve({
        isVoted,
        voteupCount: answerId === "1" ? 19 : 5,
      }),
    );
    const controller = new AnswerVoteController({ setAnswerVote });
    const voted = answer("1", true, 20);
    const untouched = answer("2", false, 5);

    await controller.toggle(voted);

    expect(setAnswerVote).toHaveBeenCalledWith("1", false);
    expect(controller.snapshot(voted).voteupCount).toBe(19);
    expect(controller.snapshot(voted).isVoted).toBe(false);
    expect(controller.snapshot(untouched)).toMatchObject({
      isVoted: false,
      voteupCount: 5,
    });
  });
});

function answer(
  id: string,
  isVoted: boolean,
  voteupCount: number,
): AnswerDocument {
  return {
    id,
    url: `https://www.zhihu.com/question/100/answer/${id}`,
    author: { name: "作者", headline: "" },
    contentHtml: "<p>回答</p>",
    excerpt: "回答",
    voteupCount,
    isVoted,
    commentCount: 0,
    question: {
      id: "100",
      title: "问题",
      url: "https://www.zhihu.com/question/100",
      detailHtml: "",
      excerpt: "",
      topics: [],
      answerCount: 1,
      followerCount: 1,
    },
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
