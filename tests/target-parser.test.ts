import { describe, expect, it } from "vitest";

import { ZhihuTargetParser } from "@/zhihu/targetParser";

const parser = new ZhihuTargetParser();

describe("ZhihuTargetParser", () => {
  it("parses a question URL", () => {
    expect(parser.parse("https://www.zhihu.com/question/123456789")).toEqual({
      type: "question",
      questionId: "123456789",
    });
  });

  it("parses an answer URL with query, anchor and trailing slash", () => {
    expect(
      parser.parse(
        "https://www.zhihu.com/question/123456789/answer/90071992547409931234/?utm_source=test#section",
      ),
    ).toEqual({
      type: "answer",
      questionId: "123456789",
      answerId: "90071992547409931234",
    });
  });

  it("finds the first supported URL in clipboard text", () => {
    expect(
      parser.findFirst(
        "参考 https://example.com 后打开 https://www.zhihu.com/question/42。",
      ),
    ).toEqual({
      target: { type: "question", questionId: "42" },
      url: "https://www.zhihu.com/question/42",
    });
  });

  it.each([
    "",
    "not a URL",
    "http://www.zhihu.com/question/1",
    "https://example.com/question/1",
    "https://www.zhihu.com/people/someone",
  ])("rejects unsupported input: %s", (input) => {
    expect(() => parser.parse(input)).toThrow();
  });
});
