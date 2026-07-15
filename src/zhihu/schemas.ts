import { z } from "zod";

import type {
  AnswerDocument,
  AnswerPage,
  QuestionReference,
  QuestionSummary,
  ZhihuAuthor,
} from "@/domain/zhihu";

const ZHIHU_WEB_ORIGIN = "https://www.zhihu.com";

const zhihuIdSchema = z
  .union([
    z.string().regex(/^\d+$/, "ID must contain digits only."),
    z.number().int().nonnegative().safe(),
  ])
  .transform(String);

const nonNegativeIntegerSchema = z.number().int().nonnegative().catch(0);
const optionalUrlSchema = z.string().url().optional().catch(undefined);
const optionalTimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .catch(undefined);

const zhihuAuthorSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).catch("未知作者"),
    headline: z.string().catch(""),
    avatar_url: optionalUrlSchema,
    url: optionalUrlSchema,
    url_token: z.string().optional().catch(undefined),
  })
  .passthrough();

const zhihuTopicSchema = z
  .object({
    id: zhihuIdSchema,
    name: z.string(),
  })
  .passthrough();

const zhihuQuestionReferenceSchema = z
  .object({
    type: z.literal("question").optional(),
    id: zhihuIdSchema,
    title: z.string().min(1),
  })
  .passthrough();

const zhihuQuestionSchema = zhihuQuestionReferenceSchema
  .extend({
    detail: z.string().catch(""),
    excerpt: z.string().catch(""),
    topics: z.array(zhihuTopicSchema).catch([]),
    answer_count: nonNegativeIntegerSchema,
    follower_count: nonNegativeIntegerSchema,
  })
  .passthrough();

const zhihuAnswerSchema = z
  .object({
    type: z.literal("answer"),
    id: zhihuIdSchema,
    url: optionalUrlSchema,
    author: zhihuAuthorSchema.nullish(),
    content: z.string(),
    excerpt: z.string().catch(""),
    voteup_count: nonNegativeIntegerSchema,
    comment_count: nonNegativeIntegerSchema,
    created_time: optionalTimestampSchema,
    updated_time: optionalTimestampSchema,
    question: zhihuQuestionReferenceSchema,
  })
  .passthrough();

const zhihuQuestionFeedSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string(),
    target: zhihuAnswerSchema,
  })
  .passthrough();

const zhihuQuestionFeedsResponseSchema = z.object({
  data: z.array(zhihuQuestionFeedSchema),
  paging: z
    .object({
      is_end: z.boolean().catch(false),
      next: optionalUrlSchema,
      previous: optionalUrlSchema,
    })
    .passthrough(),
});

const zhihuErrorResponseSchema = z.object({
  error: z
    .object({
      code: z.union([z.string(), z.number()]).transform(String),
      message: z.string().catch("知乎接口返回错误"),
    })
    .passthrough(),
});

export class ZhihuResponseValidationError extends Error {
  readonly code = "INVALID_ZHIHU_RESPONSE";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZhihuResponseValidationError";
  }
}

export class ZhihuApiResponseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ZhihuApiResponseError";
    this.code = code;
  }
}

export function parseQuestionResponse(text: string): QuestionSummary {
  return validateResponse(() =>
    toQuestionSummary(zhihuQuestionSchema.parse(parseResponseJson(text))),
  );
}

export function parseAnswerResponse(text: string): AnswerDocument {
  return validateResponse(() =>
    toAnswerDocument(zhihuAnswerSchema.parse(parseResponseJson(text))),
  );
}

export function parseQuestionFeedsResponse(text: string): AnswerPage {
  return validateResponse(() => {
    const response = zhihuQuestionFeedsResponseSchema.parse(
      parseResponseJson(text),
    );
    return {
      answers: response.data.map(({ target }) => toAnswerDocument(target)),
      isEnd: response.paging.is_end,
      nextPageUrl: response.paging.next ?? null,
      previousPageUrl: response.paging.previous ?? null,
    };
  });
}

function parseResponseJson(text: string): unknown {
  const json = JSON.parse(text) as unknown;
  const errorResponse = zhihuErrorResponseSchema.safeParse(json);
  if (errorResponse.success) {
    throw new ZhihuApiResponseError(
      errorResponse.data.error.code,
      errorResponse.data.error.message,
    );
  }
  return json;
}

function validateResponse<TResult>(parse: () => TResult): TResult {
  try {
    return parse();
  } catch (error: unknown) {
    if (error instanceof ZhihuApiResponseError) {
      throw error;
    }
    throw new ZhihuResponseValidationError(
      "Zhihu response does not match the expected structure.",
      { cause: error },
    );
  }
}

function toQuestionSummary(
  question: z.output<typeof zhihuQuestionSchema>,
): QuestionSummary {
  return {
    ...toQuestionReference(question),
    detailHtml: question.detail,
    excerpt: question.excerpt,
    topics: question.topics.map(({ id, name }) => ({ id, name })),
    answerCount: question.answer_count,
    followerCount: question.follower_count,
  };
}

function toQuestionReference(
  question: z.output<typeof zhihuQuestionReferenceSchema>,
): QuestionReference {
  return {
    id: question.id,
    title: question.title,
    url: `${ZHIHU_WEB_ORIGIN}/question/${question.id}`,
  };
}

function toAnswerDocument(
  answer: z.output<typeof zhihuAnswerSchema>,
): AnswerDocument {
  return {
    id: answer.id,
    url: `${ZHIHU_WEB_ORIGIN}/question/${answer.question.id}/answer/${answer.id}`,
    author: toAuthor(answer.author),
    contentHtml: answer.content,
    excerpt: answer.excerpt,
    voteupCount: answer.voteup_count,
    commentCount: answer.comment_count,
    ...(answer.created_time === undefined
      ? {}
      : { createdTime: answer.created_time }),
    ...(answer.updated_time === undefined
      ? {}
      : { updatedTime: answer.updated_time }),
    question: toQuestionReference(answer.question),
  };
}

function toAuthor(
  author: z.output<typeof zhihuAuthorSchema> | null | undefined,
): ZhihuAuthor {
  if (author == null) {
    return { name: "未知作者", headline: "" };
  }

  const profileUrl =
    author.url_token === undefined
      ? author.url
      : `${ZHIHU_WEB_ORIGIN}/people/${author.url_token}`;
  return {
    ...(author.id === undefined ? {} : { id: author.id }),
    name: author.name,
    headline: author.headline,
    ...(author.avatar_url === undefined ? {} : { avatarUrl: author.avatar_url }),
    ...(profileUrl === undefined ? {} : { profileUrl }),
  };
}
