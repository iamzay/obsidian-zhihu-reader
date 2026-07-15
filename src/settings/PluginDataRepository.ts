import { z } from "zod";

import type { PersistedZhihuAuth } from "@/auth/types";
import type { QuestionHistoryEntry } from "@/history/QuestionHistory";
import {
  DEFAULT_PLUGIN_DATA,
  DEFAULT_PLUGIN_SETTINGS,
  type PluginData,
  PluginDataSchema,
  type PluginSettings,
  PluginSettingsSchema,
  PersistedZhihuAuthSchema,
  QuestionHistoryEntrySchema,
} from "@/settings/data";

export interface PluginDataStorage {
  load(): Promise<unknown>;
  save(data: unknown): Promise<void>;
}

export interface PluginDataLoadResult {
  readonly data: PluginData;
  readonly diagnostic: string | null;
}

export class PluginDataRepository {
  constructor(private readonly storage: PluginDataStorage) {}

  async load(): Promise<PluginDataLoadResult> {
    let raw: unknown;
    try {
      raw = await this.storage.load();
    } catch (error: unknown) {
      return {
        data: structuredClone(DEFAULT_PLUGIN_DATA),
        diagnostic: `无法读取插件配置：${errorMessage(error)}`,
      };
    }

    if (raw == null) {
      return { data: structuredClone(DEFAULT_PLUGIN_DATA), diagnostic: null };
    }

    const recovered = recoverPluginData(raw);
    return recovered;
  }

  async save(data: PluginData): Promise<void> {
    await this.storage.save(PluginDataSchema.parse(data));
  }

  async saveSettings(
    current: PluginData,
    settings: PluginSettings,
  ): Promise<PluginData> {
    const data: PluginData = {
      ...current,
      settings: PluginSettingsSchema.parse(settings),
    };
    await this.save(data);
    return data;
  }

  async saveAuth(
    current: PluginData,
    auth: PersistedZhihuAuth,
  ): Promise<PluginData> {
    const data: PluginData = {
      ...current,
      auth: PersistedZhihuAuthSchema.parse(auth),
    };
    await this.save(data);
    return data;
  }

  async saveHistory(
    current: PluginData,
    history: readonly QuestionHistoryEntry[],
  ): Promise<PluginData> {
    const data: PluginData = {
      ...current,
      history: z.array(QuestionHistoryEntrySchema).parse(history),
    };
    await this.save(data);
    return data;
  }
}

export class MemoryPluginDataStorage implements PluginDataStorage {
  private value: unknown;

  constructor(initialValue: unknown = null) {
    this.value = structuredClone(initialValue);
  }

  load(): Promise<unknown> {
    return Promise.resolve(structuredClone(this.value));
  }

  save(data: unknown): Promise<void> {
    this.value = structuredClone(data);
    return Promise.resolve();
  }
}

function recoverPluginData(raw: unknown): PluginDataLoadResult {
  const recordResult = z.record(z.unknown()).safeParse(raw);
  if (!recordResult.success) {
    return {
      data: structuredClone(DEFAULT_PLUGIN_DATA),
      diagnostic: "插件配置根节点无效，已恢复默认设置。",
    };
  }

  const issues: string[] = [];
  const settingsValue = recordResult.data.settings;
  const settingsResult = z.record(z.unknown()).safeParse(settingsValue);
  const settingsRaw = settingsResult.success ? settingsResult.data : {};
  if (settingsValue !== undefined && !settingsResult.success) {
    issues.push("settings");
  }
  if (
    recordResult.data.version !== undefined &&
    recordResult.data.version !== 1
  ) {
    issues.push("version");
  }
  const settings: PluginSettings = {
    feedLimit: recoverField(
      "feedLimit",
      settingsRaw.feedLimit,
      z.number().int().min(1).max(20),
      DEFAULT_PLUGIN_SETTINGS.feedLimit,
      issues,
    ),
    answerOrder: recoverField(
      "answerOrder",
      settingsRaw.answerOrder,
      z.enum(["default", "updated"]),
      DEFAULT_PLUGIN_SETTINGS.answerOrder,
      issues,
    ),
    historyLimit: recoverField(
      "historyLimit",
      settingsRaw.historyLimit,
      z.number().int().min(1).max(500),
      DEFAULT_PLUGIN_SETTINGS.historyLimit,
      issues,
    ),
    saveFolder: recoverField(
      "saveFolder",
      settingsRaw.saveFolder,
      z.string().trim().min(1),
      DEFAULT_PLUGIN_SETTINGS.saveFolder,
      issues,
    ),
    notePathTemplate: recoverField(
      "notePathTemplate",
      settingsRaw.notePathTemplate,
      z.string().trim().min(1),
      DEFAULT_PLUGIN_SETTINGS.notePathTemplate,
      issues,
    ),
    openNoteAfterSave: recoverField(
      "openNoteAfterSave",
      settingsRaw.openNoteAfterSave,
      z.boolean(),
      DEFAULT_PLUGIN_SETTINGS.openNoteAfterSave,
      issues,
    ),
    imageMode: recoverField(
      "imageMode",
      settingsRaw.imageMode,
      z.enum(["remote", "vault"]),
      DEFAULT_PLUGIN_SETTINGS.imageMode,
      issues,
    ),
    attachmentLocation: recoverField(
      "attachmentLocation",
      settingsRaw.attachmentLocation,
      z.enum(["obsidian", "custom"]),
      DEFAULT_PLUGIN_SETTINGS.attachmentLocation,
      issues,
    ),
    attachmentFolder: recoverField(
      "attachmentFolder",
      settingsRaw.attachmentFolder,
      z.string().trim().min(1),
      DEFAULT_PLUGIN_SETTINGS.attachmentFolder,
      issues,
    ),
  };
  const authResult = PersistedZhihuAuthSchema.safeParse(
    recordResult.data.auth,
  );
  if (recordResult.data.auth !== undefined && !authResult.success) {
    issues.push("auth");
  }
  const auth = authResult.success
    ? authResult.data
    : structuredClone(DEFAULT_PLUGIN_DATA.auth);
  const historyResult = z
    .array(QuestionHistoryEntrySchema)
    .safeParse(recordResult.data.history);
  if (recordResult.data.history !== undefined && !historyResult.success) {
    issues.push("history");
  }
  const history = historyResult.success ? historyResult.data : [];

  return {
    data: { version: 1, settings, auth, history },
    diagnostic:
      issues.length === 0
        ? null
        : `以下配置无效并已恢复默认值：${issues.join("、")}`,
  };
}

function recoverField<T>(
  name: string,
  value: unknown,
  schema: z.ZodType<T>,
  fallback: T,
  issues: string[],
): T {
  if (value === undefined) {
    return fallback;
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  issues.push(name);
  return fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
