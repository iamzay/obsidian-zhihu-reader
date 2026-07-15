import { describe, expect, it } from "vitest";

import {
  buildAnswerCommentsUrl,
  buildAuthorAnswersUrl,
  buildChildCommentsUrl,
  buildHotListUrl,
  buildQuestionFeedsUrl,
  buildSearchAnswersUrl,
} from "@/zhihu/urls";

describe("buildQuestionFeedsUrl", () => {
  it("builds a filtered answer search URL and validates paging", () => {
    const initial = new URL(buildSearchAnswersUrl("  Obsidian  "));
    expect(initial.pathname).toBe("/api/v4/search_v3");
    expect(initial.searchParams.get("q")).toBe("Obsidian");
    expect(initial.searchParams.get("vertical")).toBe("answer");
    expect(initial.searchParams.get("search_source")).toBe("Filter");
    expect(initial.searchParams.get("limit")).toBe("20");
    expect(initial.searchParams.get("include")).toContain("data[*].highlight");

    const next =
      "https://www.zhihu.com/api/v4/search_v3?q=Obsidian&offset=20&limit=20";
    expect(buildSearchAnswersUrl("Obsidian", { pageUrl: next })).toContain(
      `${next}&include=`,
    );
    expect(() =>
      buildSearchAnswersUrl("another query", { pageUrl: next }),
    ).toThrow("Invalid Zhihu search page URL.");
  });

  it("rejects empty, overlong and invalid-limit search requests", () => {
    expect(() => buildSearchAnswersUrl("   ")).toThrow(
      "Search query must contain between 1 and 200 characters.",
    );
    expect(() => buildSearchAnswersUrl("x".repeat(201))).toThrow(
      "Search query must contain between 1 and 200 characters.",
    );
    expect(() => buildSearchAnswersUrl("Obsidian", { limit: 21 })).toThrow(
      "Search limit must be an integer between 1 and 20.",
    );
  });

  it("builds and validates answer comment pagination URLs", () => {
    expect(buildAnswerCommentsUrl("123", { limit: 20, order: "time" })).toBe(
      "https://www.zhihu.com/api/v4/comment_v5/answers/123/root_comment?order_by=ts&limit=20",
    );
    const next =
      "https://www.zhihu.com/api/v4/comment_v5/answers/123/root_comment?order_by=score&limit=10&offset=10";
    expect(buildAnswerCommentsUrl("123", { pageUrl: next })).toBe(next);
    expect(() =>
      buildAnswerCommentsUrl("123", {
        pageUrl:
          "https://www.zhihu.com/api/v4/comment_v5/answers/456/root_comment?offset=10",
      }),
    ).toThrow("Invalid Zhihu comments page URL.");
  });

  it("builds and validates child comment pagination URLs", () => {
    expect(buildChildCommentsUrl("789")).toBe(
      "https://www.zhihu.com/api/v4/comment_v5/comment/789/child_comment?limit=10",
    );
    expect(() => buildChildCommentsUrl("not-an-id")).toThrow(
      "Comment ID must contain digits only.",
    );
    expect(() => buildChildCommentsUrl("789", { limit: 21 })).toThrow(
      "Comment limit must be an integer between 1 and 20.",
    );
  });

  it("builds and validates the paginated author answers endpoint", () => {
    const initial = new URL(buildAuthorAnswersUrl("fixture-author"));
    expect(initial.pathname).toBe(
      "/api/v4/members/fixture-author/answers",
    );
    expect(initial.searchParams.get("sort_by")).toBe("created");
    expect(initial.searchParams.get("limit")).toBe("10");
    expect(initial.searchParams.get("include")).toContain("data[*].excerpt");

    const next =
      "https://www.zhihu.com/api/v4/members/fixture-author/answers?offset=10&limit=10";
    expect(buildAuthorAnswersUrl("fixture-author", { pageUrl: next })).toContain(
      `${next}&include=`,
    );
    expect(() =>
      buildAuthorAnswersUrl("fixture-author", {
        pageUrl:
          "https://www.zhihu.com/api/v4/members/another-author/answers?offset=10",
      }),
    ).toThrow("Invalid Zhihu author answers page URL.");
  });

  it("upgrades trusted HTTP author answer paging URLs returned by Zhihu", () => {
    const next =
      "http://www.zhihu.com/api/v4/members/fixture-author/answers?limit=10&offset=10&sort_by=created";
    const result = new URL(
      buildAuthorAnswersUrl("fixture-author", { pageUrl: next }),
    );

    expect(result.protocol).toBe("https:");
    expect(result.hostname).toBe("www.zhihu.com");
    expect(result.pathname).toBe(
      "/api/v4/members/fixture-author/answers",
    );
    expect(result.searchParams.get("offset")).toBe("10");
    expect(() =>
      buildAuthorAnswersUrl("fixture-author", {
        pageUrl:
          "http://example.com/api/v4/members/fixture-author/answers?offset=10",
      }),
    ).toThrow("Invalid Zhihu author answers page URL.");
  });

  it("builds the mobile daily hot list endpoint used by the reference client", () => {
    expect(buildHotListUrl()).toBe(
      "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&mobile=true",
    );
    expect(() => buildHotListUrl(51)).toThrow(
      "Hot list limit must be an integer between 1 and 50.",
    );
  });

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
