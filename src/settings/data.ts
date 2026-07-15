import { z } from "zod";

export const DEFAULT_PLUGIN_SETTINGS = {
  feedLimit: 6,
  answerOrder: "default",
  historyEnabled: true,
  historyLimit: 50,
  saveFolder: "Zhihu Answers",
} as const;

export const PluginSettingsSchema = z.object({
  feedLimit: z.number().int().min(1).max(20),
  answerOrder: z.enum(["default", "updated"]),
  historyEnabled: z.boolean(),
  historyLimit: z.number().int().min(1).max(500),
  saveFolder: z.string().trim().min(1),
});

export const PluginDataSchema = z.object({
  version: z.literal(1),
  settings: PluginSettingsSchema,
});

export type PluginSettings = z.infer<typeof PluginSettingsSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;

export const DEFAULT_PLUGIN_DATA: PluginData = {
  version: 1,
  settings: { ...DEFAULT_PLUGIN_SETTINGS },
};
