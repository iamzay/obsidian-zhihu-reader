const ZHIHU_WEB_ORIGIN = "https://www.zhihu.com";

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

  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Answer limit must be an integer between 1 and 100.");
  }

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
