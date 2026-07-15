import { describe, expect, it } from "vitest";

import { buildQuestionFeedsUrl } from "@/zhihu/urls";

describe("buildQuestionFeedsUrl", () => {
  it("builds the question feeds endpoint used by Zhihu", () => {
    expect(
      buildQuestionFeedsUrl("123456", { limit: 20, order: "default" }),
    ).toBe(
      "https://www.zhihu.com/api/v4/questions/123456/feeds?limit=20&order=default&include=data%5B*%5D.content%2Cexcerpt%2Cheadline%2Ctarget.author.badge_v2",
    );
  });

  it("uses the product default of six answers", () => {
    expect(buildQuestionFeedsUrl("123456")).toBe(
      "https://www.zhihu.com/api/v4/questions/123456/feeds?limit=6&include=data%5B*%5D.content%2Cexcerpt%2Cheadline%2Ctarget.author.badge_v2",
    );
  });

  it("requests full answer content for question feed items", () => {
    const url = new URL(buildQuestionFeedsUrl("123456"));

    expect(url.searchParams.get("include")).toContain("data[*].content");
  });

  it("rejects a non-numeric question id", () => {
    expect(() => buildQuestionFeedsUrl("123/answers")).toThrow(
      "Question ID must contain digits only.",
    );
  });

  it.each([0, 21, 1.5])("rejects an invalid feed limit of %s", (limit) => {
    expect(() => buildQuestionFeedsUrl("123456", { limit })).toThrow(
      "Answer limit must be an integer between 1 and 20.",
    );
  });

  it("accepts only the matching Zhihu feeds URL for a later page", () => {
    const next =
      "https://www.zhihu.com/api/v4/questions/123456/feeds?limit=6&offset=6";
    expect(buildQuestionFeedsUrl("123456", { pageUrl: next })).toBe(
      `${next}&include=data%5B*%5D.content%2Cexcerpt%2Cheadline%2Ctarget.author.badge_v2`,
    );
    expect(() =>
      buildQuestionFeedsUrl("123456", {
        pageUrl: "https://example.com/api/v4/questions/123456/feeds",
      }),
    ).toThrow("Invalid Zhihu question feeds page URL.");
    expect(() =>
      buildQuestionFeedsUrl("123456", {
        pageUrl:
          "https://www.zhihu.com/api/v4/questions/654321/feeds?limit=6",
      }),
    ).toThrow("Invalid Zhihu question feeds page URL.");
  });
});
