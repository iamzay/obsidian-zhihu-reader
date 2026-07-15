import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseAnswerResponse,
  parseAuthorAnswersResponse,
  parseCommentsResponse,
  parseHotListResponse,
  parseQuestionFeedsResponse,
  parseQuestionResponse,
  parseSearchAnswersResponse,
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
    expect(answer.question).toMatchObject({
      id: "123456789",
      title: "如何在 Obsidian 中建立阅读工作流？",
      url: "https://www.zhihu.com/question/123456789",
    });
    expect(answer.url).toBe(
      "https://www.zhihu.com/question/123456789/answer/90071992547409931234",
    );
    expect(answer.author.urlToken).toBe("fixture-author");
  });

  it("parses an author answer page with exact IDs and paging", () => {
    const page = parseAuthorAnswersResponse(fixture("member-answers.json"));

    expect(page.answers[0]).toEqual({
      answerId: "90071992547409931234",
      questionId: "1993016651038364760",
      questionTitle: "如何建立稳定的阅读工作流？",
      excerpt: "先阅读，再决定是否保存。",
      voteupCount: 128,
      createdTime: 1700000000,
    });
    expect(page).toMatchObject({
      isEnd: false,
      nextPageUrl:
        "https://www.zhihu.com/api/v4/members/fixture-author/answers?sort_by=created&limit=10&offset=10",
    });
  });

  it("parses root comments, visible replies and paging", () => {
    const page = parseCommentsResponse(fixture("comments.json"));

    expect(page.comments[0]).toMatchObject({
      id: "90071992547409939999",
      author: { name: "评论作者", urlToken: "comment-author" },
      likeCount: 42,
      childCommentCount: 2,
      isAnswerAuthor: true,
      isTop: true,
    });
    expect(page.comments[0]?.contentHtml).toContain("Markdown");
    expect(page.comments[0]?.childComments[0]).toMatchObject({
      id: "90071992547409940001",
      author: { name: "回复者" },
      replyToAuthor: { name: "评论作者" },
    });
    expect(page.comments[1]?.author).toEqual({
      name: "未知作者",
      headline: "",
    });
    expect(page.nextPageUrl).toContain("offset=10");
  });

  it("parses answer search results, strips highlights and skips unsupported cards", () => {
    const page = parseSearchAnswersResponse(fixture("search-answers.json"));

    expect(page.results).toHaveLength(2);
    expect(page.results[0]).toEqual({
      answerId: "90071992547409931234",
      questionId: "1993016651038364760",
      questionTitle: "如何用 Obsidian 建立阅读工作流？",
      excerpt: "使用 Obsidian 建立阅读 & 笔记工作流。",
      author: {
        id: "fixture-author-id",
        urlToken: "fixture-author",
        name: "示例作者",
        headline: "阅读与写作",
        profileUrl: "https://www.zhihu.com/people/fixture-author",
      },
      voteupCount: 128,
      commentCount: 6,
    });
    expect(page.results[1]?.author).toEqual({
      name: "未知作者",
      headline: "",
    });
    expect(page.nextPageUrl).toContain("offset=20");
  });

  it("reads question names from live answer search results", () => {
    const page = parseSearchAnswersResponse(JSON.stringify({
      data: [{
        type: "search_result",
        object: {
          type: "answer",
          id: "234567890",
          url: "https://www.zhihu.com/answers/234567890",
          excerpt: "搜索结果摘要",
          voteup_count: 32,
          comment_count: 1,
          author: null,
          question: {
            type: "question",
            id: "123456789",
            url: "https://www.zhihu.com/questions/123456789",
            name: "搜索接口返回的问题标题",
          },
        },
      }],
      paging: { is_end: true },
    }));

    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.questionTitle).toBe("搜索接口返回的问题标题");
  });

  it("parses hot list items without losing an unsafe numeric question id", () => {
    const items = parseHotListResponse(fixture("hot-list.json"));

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      rank: 1,
      questionId: "1993016651038364760",
      title: "高校教师为什么会成为压力最大的职业之一？",
      excerpt: "关于职业压力、收入和社会地位的讨论。",
      heatLabel: "1080 万热度",
      answerCount: 398,
      followerCount: 1143,
      thumbnailUrl: "https://picx.zhimg.com/v2-hot-list.png",
    });
  });

  it("recovers an exact hot-list ID from a singular question URL", () => {
    const [item] = parseHotListResponse(JSON.stringify({
      data: [{
        detail_text: "100 万热度",
        target: {
          type: "question",
          id: 9_007_199_254_740_992,
          title: "问题标题",
          url: "https://www.zhihu.com/question/90071992547409931234",
        },
      }],
    }));

    expect(item?.questionId).toBe("90071992547409931234");
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
