const ZHIHU_WEB_ORIGIN = "https://www.zhihu.com";
const QUESTION_FEEDS_INCLUDE =
  "data[*].content,excerpt,headline,target.author.badge_v2";
const ANSWER_INCLUDE = [
  "content",
  "excerpt",
  "voteup_count",
  "comment_count",
  "created_time",
  "updated_time",
  "question.detail",
  "question.excerpt",
  "question.topics",
  "question.answer_count",
  "question.follower_count",
  "author.headline",
  "author.avatar_url",
  "author.url_token",
].join(",");

export interface FetchQuestionAnswersOptions {
  limit?: number;
  order?: "default" | "updated";
  pageUrl?: string;
}

export function buildHotListUrl(limit = 50): string {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("Hot list limit must be an integer between 1 and 50.");
  }
  const url = new URL(
    "/api/v3/feed/topstory/hot-lists/total",
    ZHIHU_WEB_ORIGIN,
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("mobile", "true");
  return url.toString();
}

export function buildQuestionFeedsUrl(
  questionId: string,
  options: FetchQuestionAnswersOptions = {},
): string {
  if (!/^\d+$/.test(questionId)) {
    throw new Error("Question ID must contain digits only.");
  }

  if (options.pageUrl !== undefined) {
    const pageUrl = new URL(
      validateQuestionFeedsPageUrl(questionId, options.pageUrl),
    );
    pageUrl.searchParams.set("include", QUESTION_FEEDS_INCLUDE);
    return pageUrl.toString();
  }

  const limit = options.limit ?? 6;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Answer limit must be an integer between 1 and 20.");
  }

  const url = new URL(
    `/api/v4/questions/${questionId}/feeds`,
    ZHIHU_WEB_ORIGIN,
  );
  url.searchParams.set("limit", String(limit));
  if (options.order !== undefined) {
    url.searchParams.set("order", options.order);
  }
  url.searchParams.set("include", QUESTION_FEEDS_INCLUDE);
  return url.toString();
}

export function buildQuestionUrl(questionId: string): string {
  if (!/^\d+$/.test(questionId)) {
    throw new Error("Question ID must contain digits only.");
  }
  const url = new URL(`/api/v4/questions/${questionId}`, ZHIHU_WEB_ORIGIN);
  url.searchParams.set(
    "include",
    ["detail", "excerpt", "topics", "answer_count", "follower_count"].join(","),
  );
  return url.toString();
}

export function buildAnswerUrl(answerId: string): string {
  if (!/^\d+$/.test(answerId)) {
    throw new Error("Answer ID must contain digits only.");
  }
  const url = new URL(`/api/v4/answers/${answerId}`, ZHIHU_WEB_ORIGIN);
  url.searchParams.set("include", ANSWER_INCLUDE);
  return url.toString();
}

function validateQuestionFeedsPageUrl(
  questionId: string,
  pageUrl: string,
): string {
  const url = new URL(pageUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.zhihu.com" ||
    url.pathname !== `/api/v4/questions/${questionId}/feeds`
  ) {
    throw new Error("Invalid Zhihu question feeds page URL.");
  }
  return url.toString();
}
