const ZHIHU_WEB_ORIGIN = "https://www.zhihu.com";
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
}

export function buildQuestionFeedsUrl(
  questionId: string,
  options: FetchQuestionAnswersOptions = {},
): string {
  if (!/^\d+$/.test(questionId)) {
    throw new Error("Question ID must contain digits only.");
  }

  const limit = options.limit ?? 6;

  const url = new URL(
    `/api/v4/questions/${questionId}/feeds`,
    ZHIHU_WEB_ORIGIN,
  );
  url.searchParams.set("limit", String(limit));
  if (options.order !== undefined) {
    url.searchParams.set("order", options.order);
  }
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
