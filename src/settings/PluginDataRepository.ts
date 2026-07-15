import { z } from "zod";

import {
  DEFAULT_PLUGIN_DATA,
  DEFAULT_PLUGIN_SETTINGS,
  type PluginData,
  PluginDataSchema,
  type PluginSettings,
  PluginSettingsSchema,
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

  async saveSettings(settings: PluginSettings): Promise<PluginData> {
    const data: PluginData = {
      version: 1,
      settings: PluginSettingsSchema.parse(settings),
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
    historyEnabled: recoverField(
      "historyEnabled",
      settingsRaw.historyEnabled,
      z.boolean(),
      DEFAULT_PLUGIN_SETTINGS.historyEnabled,
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
  };

  return {
    data: { version: 1, settings },
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
