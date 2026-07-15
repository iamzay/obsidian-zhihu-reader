import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseAnswerResponse,
  parseQuestionFeedsResponse,
  parseQuestionResponse,
  ZhihuApiResponseError,
  ZhihuResponseValidationError,
} from "@/zhihu/schemas";

function fixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/zhihu/${name}`, import.meta.url),
    "utf8",
  );
}

describe("Zhihu response parsing", () => {
  it("converts a question fixture to a domain summary", () => {
    const question = parseQuestionResponse(fixture("question.json"));

    expect(question).toMatchObject({
      id: "123456789",
      title: "如何在 Obsidian 中建立阅读工作流？",
      answerCount: 18,
      followerCount: 204,
    });
    expect(question.topics.map(({ id }) => id)).toEqual([
      "19550517",
      "19556664",
    ]);
  });

  it("preserves a string ID larger than Number.MAX_SAFE_INTEGER", () => {
    const answer = parseAnswerResponse(fixture("answer.json"));

    expect(answer.id).toBe("90071992547409931234");
    expect(answer.question).toEqual({
      id: "123456789",
      title: "如何在 Obsidian 中建立阅读工作流？",
      url: "https://www.zhihu.com/question/123456789",
    });
    expect(answer.url).toBe(
      "https://www.zhihu.com/question/123456789/answer/90071992547409931234",
    );
  });

  it("rejects an unsafe numeric ID instead of accepting rounded data", () => {
    expect(() =>
      parseAnswerResponse(`{
        "type": "answer",
        "id": 9007199254740992,
        "content": "<p>回答正文</p>",
        "question": { "id": 123, "title": "问题标题" }
      }`),
    ).toThrowError(ZhihuResponseValidationError);
  });

  it("applies explicit defaults to missing optional answer fields", () => {
    const page = parseQuestionFeedsResponse(fixture("question-feeds.json"));
    const answer = page.answers[1];

    expect(answer).toBeDefined();
    expect(answer).toMatchObject({
      excerpt: "",
      voteupCount: 0,
      commentCount: 0,
      author: { name: "未知作者", headline: "" },
    });
    expect(page).toMatchObject({ isEnd: false });
    expect(page.nextPageUrl).toContain("offset=6");
  });

  it("parses an empty question with stable defaults", () => {
    const question = parseQuestionResponse(fixture("empty-question.json"));

    expect(question).toMatchObject({
      detailHtml: "",
      excerpt: "",
      topics: [],
      answerCount: 0,
      followerCount: 0,
    });
  });

  it("returns a recognizable validation error for missing required fields", () => {
    expect(() => parseQuestionResponse('{"id": 123}')).toThrowError(
      ZhihuResponseValidationError,
    );

    try {
      parseQuestionResponse('{"id": 123}');
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "INVALID_ZHIHU_RESPONSE" });
    }
  });

  it("rejects an answer when its required body is missing", () => {
    expect(() =>
      parseAnswerResponse(
        JSON.stringify({
          type: "answer",
          id: "123",
          question: { id: "456", title: "Question" },
        }),
      ),
    ).toThrowError(ZhihuResponseValidationError);
  });

  it("preserves a Zhihu error code and message", () => {
    expect(() => parseQuestionResponse(fixture("error.json"))).toThrowError(
      new ZhihuApiResponseError("10002", "内容不存在或已被删除"),
    );
  });
});
