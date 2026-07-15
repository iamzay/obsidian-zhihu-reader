import { z } from "zod";

import type {
  AnswerDocument,
  AnswerPage,
  AuthorAnswerPage,
  AuthorAnswerSummary,
  CommentPage,
  QuestionReference,
  QuestionSummary,
  ZhihuComment,
  ZhihuHotListItem,
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
    url_token: z.string().min(1).optional().catch(undefined),
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
    question: zhihuQuestionSchema,
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

const zhihuHotListItemSchema = z
  .object({
    card_id: z.string().optional(),
    detail_text: z.string().catch(""),
    target: z
      .object({
        type: z.string(),
        id: z.union([z.string(), z.number()]).optional(),
        title: z.string().optional(),
        excerpt: z.string().catch(""),
        url: z.string().optional(),
        answer_count: nonNegativeIntegerSchema,
        follower_count: nonNegativeIntegerSchema,
      })
      .passthrough(),
    children: z
      .array(
        z
          .object({
            thumbnail: optionalUrlSchema,
          })
          .passthrough(),
      )
      .catch([]),
  })
  .passthrough();

const zhihuHotListResponseSchema = z.object({
  data: z.array(zhihuHotListItemSchema),
});

const zhihuAuthorAnswerSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    url: z.string().optional(),
    excerpt: z.string().catch(""),
    voteup_count: nonNegativeIntegerSchema,
    created_time: optionalTimestampSchema,
    question: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        title: z.string().min(1),
        url: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const zhihuAuthorAnswersResponseSchema = z.object({
  data: z.array(zhihuAuthorAnswerSchema),
  paging: z
    .object({
      is_end: z.boolean().catch(false),
      next: optionalUrlSchema,
    })
    .passthrough(),
});

const zhihuCommentBaseSchema = z
  .object({
    id: zhihuIdSchema,
    content: z.string().catch(""),
    created_time: optionalTimestampSchema,
    like_count: nonNegativeIntegerSchema,
    child_comment_count: nonNegativeIntegerSchema,
    is_author: z.boolean().catch(false),
    top: z.boolean().catch(false),
    author: zhihuAuthorSchema.nullish(),
    reply_to_author: zhihuAuthorSchema.nullish(),
  })
  .passthrough();

const zhihuCommentSchema = zhihuCommentBaseSchema.extend({
  child_comments: z.array(zhihuCommentBaseSchema).catch([]),
});

const zhihuCommentsResponseSchema = z.object({
  data: z.array(zhihuCommentSchema),
  paging: z
    .object({
      is_end: z.boolean().catch(false),
      next: optionalUrlSchema,
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

export function parseHotListResponse(text: string): readonly ZhihuHotListItem[] {
  return validateResponse(() => {
    const response = zhihuHotListResponseSchema.parse(parseResponseJson(text));
    return response.data.flatMap((item, index) => {
      if (item.target.type !== "question" || item.target.title === undefined) {
        return [];
      }
      const questionId = hotQuestionId(item);
      const thumbnailUrl = item.children.find(
        ({ thumbnail }) => thumbnail !== undefined,
      )?.thumbnail;
      return [{
        rank: index + 1,
        questionId,
        title: item.target.title,
        excerpt: item.target.excerpt,
        heatLabel: item.detail_text,
        answerCount: item.target.answer_count,
        followerCount: item.target.follower_count,
        ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
      }];
    });
  });
}

export function parseAuthorAnswersResponse(text: string): AuthorAnswerPage {
  return validateResponse(() => {
    const response = zhihuAuthorAnswersResponseSchema.parse(
      parseResponseJson(text),
    );
    return {
      answers: response.data.map(toAuthorAnswerSummary),
      isEnd: response.paging.is_end,
      nextPageUrl: response.paging.next ?? null,
    };
  });
}

export function parseCommentsResponse(text: string): CommentPage {
  return validateResponse(() => {
    const response = zhihuCommentsResponseSchema.parse(parseResponseJson(text));
    return {
      comments: response.data.map(toComment),
      isEnd: response.paging.is_end,
      nextPageUrl: response.paging.next ?? null,
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
    question: toQuestionSummary(answer.question),
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
    ...(author.url_token === undefined ? {} : { urlToken: author.url_token }),
    name: author.name,
    headline: author.headline,
    ...(author.avatar_url === undefined ? {} : { avatarUrl: author.avatar_url }),
    ...(profileUrl === undefined ? {} : { profileUrl }),
  };
}

function toAuthorAnswerSummary(
  answer: z.output<typeof zhihuAuthorAnswerSchema>,
): AuthorAnswerSummary {
  const answerId = exactId(
    answer.id,
    answer.url,
    /\/answers?\/(\d+)(?:\/|$)/u,
    "answer",
  );
  const questionId = exactId(
    answer.question.id,
    answer.question.url,
    /\/questions?\/(\d+)(?:\/|$)/u,
    "question",
  );
  return {
    answerId,
    questionId,
    questionTitle: answer.question.title,
    excerpt: answer.excerpt,
    voteupCount: answer.voteup_count,
    ...(answer.created_time === undefined
      ? {}
      : { createdTime: answer.created_time }),
  };
}

function toComment(
  comment: z.output<typeof zhihuCommentSchema>,
): ZhihuComment {
  return {
    id: comment.id,
    author: toAuthor(comment.author),
    ...(comment.reply_to_author == null
      ? {}
      : { replyToAuthor: toAuthor(comment.reply_to_author) }),
    contentHtml: comment.content,
    ...(comment.created_time === undefined
      ? {}
      : { createdTime: comment.created_time }),
    likeCount: comment.like_count,
    childCommentCount: comment.child_comment_count,
    childComments: comment.child_comments.map((child) => ({
      id: child.id,
      author: toAuthor(child.author),
      ...(child.reply_to_author == null
        ? {}
        : { replyToAuthor: toAuthor(child.reply_to_author) }),
      contentHtml: child.content,
      ...(child.created_time === undefined
        ? {}
        : { createdTime: child.created_time }),
      likeCount: child.like_count,
      childCommentCount: child.child_comment_count,
      childComments: [],
      isAnswerAuthor: child.is_author,
      isTop: child.top,
    })),
    isAnswerAuthor: comment.is_author,
    isTop: comment.top,
  };
}

function exactId(
  value: string | number | undefined,
  url: string | undefined,
  urlPattern: RegExp,
  label: string,
): string {
  if (typeof value === "string" && /^\d+$/u.test(value)) {
    return value;
  }
  const urlId = urlPattern.exec(url ?? "")?.[1];
  if (urlId !== undefined) {
    return urlId;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new Error(`Zhihu author answer does not contain an exact ${label} ID.`);
}

function hotQuestionId(
  item: z.output<typeof zhihuHotListItemSchema>,
): string {
  const stringId = typeof item.target.id === "string" && /^\d+$/u.test(item.target.id)
    ? item.target.id
    : null;
  if (stringId !== null) {
    return stringId;
  }
  const cardId = /^Q_(\d+)$/u.exec(item.card_id ?? "")?.[1];
  if (cardId !== undefined) {
    return cardId;
  }
  const urlId = /\/questions?\/(\d+)(?:\/|$)/u.exec(item.target.url ?? "")?.[1];
  if (urlId !== undefined) {
    return urlId;
  }
  if (typeof item.target.id === "number" && Number.isSafeInteger(item.target.id)) {
    return String(item.target.id);
  }
  throw new Error("Zhihu hot list item does not contain an exact question ID.");
}
