import type { Plugin } from "obsidian";

import type { PluginDataStorage } from "@/settings/PluginDataRepository";

export class ObsidianPluginDataStorage implements PluginDataStorage {
  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<unknown> {
    return (await this.plugin.loadData()) as unknown;
  }

  async save(data: unknown): Promise<void> {
    await this.plugin.saveData(data);
  }
}
