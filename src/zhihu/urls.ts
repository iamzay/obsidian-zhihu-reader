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
const AUTHOR_ANSWERS_INCLUDE =
  "data[*].excerpt,voteup_count,created_time,question";

export interface FetchQuestionAnswersOptions {
  limit?: number;
  order?: "default" | "updated";
  pageUrl?: string;
}

export interface FetchAuthorAnswersOptions {
  limit?: number;
  pageUrl?: string;
}

export interface FetchAnswerCommentsOptions {
  limit?: number;
  order?: "score" | "time";
  pageUrl?: string;
}

export interface FetchChildCommentsOptions {
  limit?: number;
  pageUrl?: string;
}

export function buildAnswerCommentsUrl(
  answerId: string,
  options: FetchAnswerCommentsOptions = {},
): string {
  assertNumericId(answerId, "Answer");
  const path = `/api/v4/comment_v5/answers/${answerId}/root_comment`;
  if (options.pageUrl !== undefined) {
    return validateCommentPageUrl(path, options.pageUrl);
  }

  const url = new URL(path, ZHIHU_WEB_ORIGIN);
  url.searchParams.set("order_by", options.order === "time" ? "ts" : "score");
  url.searchParams.set("limit", String(validCommentLimit(options.limit)));
  return url.toString();
}

export function buildChildCommentsUrl(
  commentId: string,
  options: FetchChildCommentsOptions = {},
): string {
  assertNumericId(commentId, "Comment");
  const path = `/api/v4/comment_v5/comment/${commentId}/child_comment`;
  if (options.pageUrl !== undefined) {
    return validateCommentPageUrl(path, options.pageUrl);
  }

  const url = new URL(path, ZHIHU_WEB_ORIGIN);
  url.searchParams.set("limit", String(validCommentLimit(options.limit)));
  return url.toString();
}

export function buildAuthorAnswersUrl(
  authorIdentifier: string,
  options: FetchAuthorAnswersOptions = {},
): string {
  const identifier = authorIdentifier.trim();
  if (identifier.length === 0) {
    throw new Error("Author identifier must not be empty.");
  }
  if (options.pageUrl !== undefined) {
    const pageUrl = new URL(
      validateAuthorAnswersPageUrl(identifier, options.pageUrl),
    );
    pageUrl.searchParams.set("include", AUTHOR_ANSWERS_INCLUDE);
    return pageUrl.toString();
  }

  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Author answer limit must be an integer between 1 and 20.");
  }
  const url = new URL(
    `/api/v4/members/${encodeURIComponent(identifier)}/answers`,
    ZHIHU_WEB_ORIGIN,
  );
  url.searchParams.set("sort_by", "created");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", "0");
  url.searchParams.set("include", AUTHOR_ANSWERS_INCLUDE);
  return url.toString();
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

function validateAuthorAnswersPageUrl(
  authorIdentifier: string,
  pageUrl: string,
): string {
  const url = new URL(pageUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.zhihu.com" ||
    url.pathname !==
      `/api/v4/members/${encodeURIComponent(authorIdentifier)}/answers`
  ) {
    throw new Error("Invalid Zhihu author answers page URL.");
  }
  return url.toString();
}

function validCommentLimit(limit = 10): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Comment limit must be an integer between 1 and 20.");
  }
  return limit;
}

function assertNumericId(id: string, label: string): void {
  if (!/^\d+$/u.test(id)) {
    throw new Error(`${label} ID must contain digits only.`);
  }
}

function validateCommentPageUrl(path: string, pageUrl: string): string {
  const url = new URL(pageUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.zhihu.com" ||
    url.pathname !== path
  ) {
    throw new Error("Invalid Zhihu comments page URL.");
  }
  return url.toString();
}
