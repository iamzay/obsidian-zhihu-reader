import { describe, expect, it } from "vitest";

import { zhihuQuestionFeedsResponseSchema } from "@/zhihu/schemas";

describe("zhihuQuestionFeedsResponseSchema", () => {
  it("keeps the answer fields needed by the reader", () => {
    const result = zhihuQuestionFeedsResponseSchema.parse({
      data: [
        {
          id: "feed-1",
          type: "feed",
          target: {
            type: "answer",
            id: 42,
            url: "https://www.zhihu.com/api/v4/answers/42",
            author: { name: "Alice", headline: "Writer" },
            content: "<p>Hello</p>",
            voteup_count: 10,
            comment_count: 2,
            question: { id: 7, title: "A question" },
          },
        },
      ],
      paging: { is_end: true, next: "" },
    });

    expect(result.data[0]?.target.id).toBe("42");
    expect(result.data[0]?.target.question.title).toBe("A question");
  });
});
