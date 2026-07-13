import { z } from "zod";

const zhihuIdSchema = z.union([z.string(), z.number()]).transform(String);

export const zhihuAuthorSchema = z
  .object({
    id: zhihuIdSchema.optional(),
    name: z.string().catch("未知作者"),
    headline: z.string().catch(""),
    avatar_url: z.string().url().optional(),
  })
  .passthrough();

export const zhihuAnswerSchema = z
  .object({
    type: z.literal("answer"),
    id: zhihuIdSchema,
    url: z.string(),
    author: zhihuAuthorSchema.nullish(),
    content: z.string().catch(""),
    excerpt: z.string().catch(""),
    voteup_count: z.number().int().catch(0),
    comment_count: z.number().int().catch(0),
    created_time: z.number().int().optional(),
    updated_time: z.number().int().optional(),
    question: z
      .object({
        id: zhihuIdSchema,
        title: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

export const zhihuQuestionFeedSchema = z
  .object({
    id: zhihuIdSchema.optional(),
    type: z.string(),
    target: zhihuAnswerSchema,
  })
  .passthrough();

export const zhihuQuestionFeedsResponseSchema = z.object({
  data: z.array(zhihuQuestionFeedSchema),
  paging: z
    .object({
      is_end: z.boolean().catch(false),
      next: z.string().catch(""),
      previous: z.string().optional(),
    })
    .passthrough(),
});

export type ZhihuAnswer = z.infer<typeof zhihuAnswerSchema>;
export type ZhihuQuestionFeedsResponse = z.infer<
  typeof zhihuQuestionFeedsResponseSchema
>;
