import { z } from "zod";

import type { PersistedZhihuAuth } from "@/auth/types";

export const DEFAULT_PLUGIN_SETTINGS = {
  feedLimit: 6,
  answerOrder: "default",
  historyLimit: 50,
  saveFolder: "Zhihu Reader",
  notePathTemplate: "{问题标题}/{作者名} - {回答ID}.md",
  openNoteAfterSave: true,
  imageMode: "remote",
  attachmentLocation: "obsidian",
  attachmentFolder: "Zhihu Reader/attachments",
} as const;

export const PluginSettingsSchema = z.object({
  feedLimit: z.number().int().min(1).max(20),
  answerOrder: z.enum(["default", "updated"]),
  historyLimit: z.number().int().min(1).max(500),
  saveFolder: z.string().trim().min(1),
  notePathTemplate: z.string().trim().min(1),
  openNoteAfterSave: z.boolean(),
  imageMode: z.enum(["remote", "vault"]),
  attachmentLocation: z.enum(["obsidian", "custom"]),
  attachmentFolder: z.string().trim().min(1),
});

export const QuestionHistoryEntrySchema = z.object({
  questionId: z.string().regex(/^\d+$/u),
  questionTitle: z.string().trim().min(1),
  lastQueriedAt: z.string().datetime({ offset: true }),
  lastAnswerNumber: z.number().int().min(1).default(1),
});

export const ZhihuAuthProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  urlToken: z.string(),
  avatarUrl: z.string().url().optional(),
});

export const PersistedZhihuAuthSchema = z.object({
  cookies: z.record(z.string()),
  profile: ZhihuAuthProfileSchema.nullable(),
  verifiedAt: z.number().nullable(),
});

export const PluginDataSchema = z.object({
  version: z.literal(1),
  settings: PluginSettingsSchema,
  auth: PersistedZhihuAuthSchema,
  history: z.array(QuestionHistoryEntrySchema),
});

export type PluginSettings = z.infer<typeof PluginSettingsSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;

export const DEFAULT_PLUGIN_DATA: PluginData = {
  version: 1,
  settings: { ...DEFAULT_PLUGIN_SETTINGS },
  auth: emptyAuth(),
  history: [],
};

function emptyAuth(): PersistedZhihuAuth {
  return { cookies: {}, profile: null, verifiedAt: null };
}
