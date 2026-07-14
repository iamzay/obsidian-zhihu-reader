import { describe, expect, it } from "vitest";

import { buildQuestionFeedsUrl } from "@/zhihu/urls";

describe("buildQuestionFeedsUrl", () => {
  it("builds the question feeds endpoint used by Zhihu", () => {
    expect(
      buildQuestionFeedsUrl("123456", { limit: 20, order: "default" }),
    ).toBe(
      "https://www.zhihu.com/api/v4/questions/123456/feeds?limit=20&order=default",
    );
  });

  it("uses the product default of six answers", () => {
    expect(buildQuestionFeedsUrl("123456")).toBe(
      "https://www.zhihu.com/api/v4/questions/123456/feeds?limit=6",
    );
  });

  it("rejects a non-numeric question id", () => {
    expect(() => buildQuestionFeedsUrl("123/answers")).toThrow(
      "Question ID must contain digits only.",
    );
  });
});
