import { describe, expect, it } from "vitest";

import {
  MemoryPluginDataStorage,
  PluginDataRepository,
} from "@/settings/PluginDataRepository";
import { DEFAULT_PLUGIN_DATA } from "@/settings/data";

describe("PluginDataRepository", () => {
  it("returns complete defaults for a new installation", async () => {
    const repository = new PluginDataRepository(
      new MemoryPluginDataStorage(),
    );

    await expect(repository.load()).resolves.toEqual({
      data: DEFAULT_PLUGIN_DATA,
      diagnostic: null,
    });
  });

  it("merges a partial old configuration with defaults", async () => {
    const repository = new PluginDataRepository(
      new MemoryPluginDataStorage({ settings: { feedLimit: 12 } }),
    );

    const result = await repository.load();

    expect(result.diagnostic).toBeNull();
    expect(result.data.settings).toEqual({
      feedLimit: 12,
      answerOrder: "default",
      historyLimit: 50,
      saveFolder: "Zhihu Reader",
      notePathTemplate: "{问题标题}/{作者名} - {回答ID}.md",
      openNoteAfterSave: true,
      imageMode: "remote",
      attachmentLocation: "obsidian",
      attachmentFolder: "Zhihu Reader/attachments",
    });
  });

  it("recovers an invalid feed limit and keeps a diagnostic", async () => {
    const repository = new PluginDataRepository(
      new MemoryPluginDataStorage({
        version: 1,
        settings: { feedLimit: 21, answerOrder: "updated" },
      }),
    );

    const result = await repository.load();

    expect(result.data.settings.feedLimit).toBe(6);
    expect(result.data.settings.answerOrder).toBe("updated");
    expect(result.diagnostic).toContain("feedLimit");
  });

  it("reports a corrupted settings root instead of silently accepting it", async () => {
    const repository = new PluginDataRepository(
      new MemoryPluginDataStorage({ version: 99, settings: "broken" }),
    );

    const result = await repository.load();

    expect(result.data).toEqual(DEFAULT_PLUGIN_DATA);
    expect(result.diagnostic).toContain("settings");
    expect(result.diagnostic).toContain("version");
  });

  it("restores settings after saving and reloading", async () => {
    const storage = new MemoryPluginDataStorage();
    const repository = new PluginDataRepository(storage);

    await repository.saveSettings(DEFAULT_PLUGIN_DATA, {
      ...DEFAULT_PLUGIN_DATA.settings,
      feedLimit: 8,
      saveFolder: "Clippings/Zhihu",
    });

    await expect(repository.load()).resolves.toMatchObject({
      data: {
        settings: { feedLimit: 8, saveFolder: "Clippings/Zhihu" },
      },
      diagnostic: null,
    });
  });

  it("preserves authentication data when settings are saved", async () => {
    const storage = new MemoryPluginDataStorage();
    const repository = new PluginDataRepository(storage);
    const current = {
      ...DEFAULT_PLUGIN_DATA,
      auth: {
        cookies: { session_cookie: "private-value" },
        profile: null,
        verifiedAt: 100,
      },
    };

    const saved = await repository.saveSettings(current, {
      ...current.settings,
      feedLimit: 10,
    });

    expect(saved.auth).toEqual(current.auth);
    expect((await repository.load()).data.auth).toEqual(current.auth);
  });

  it("persists history without replacing settings or authentication", async () => {
    const storage = new MemoryPluginDataStorage();
    const repository = new PluginDataRepository(storage);
    const current = {
      ...DEFAULT_PLUGIN_DATA,
      settings: { ...DEFAULT_PLUGIN_DATA.settings, feedLimit: 9 },
      auth: {
        cookies: { session_cookie: "private-value" },
        profile: null,
        verifiedAt: 100,
      },
    };

    const saved = await repository.saveHistory(current, [
      {
        questionId: "100",
        questionTitle: "测试问题",
        lastQueriedAt: "2026-07-15T08:00:00.000Z",
      },
    ]);

    expect(saved.settings.feedLimit).toBe(9);
    expect(saved.auth).toEqual(current.auth);
    await expect(repository.load()).resolves.toMatchObject({
      data: { history: [{ questionId: "100", questionTitle: "测试问题" }] },
    });
  });

  it("rejects an invalid feed limit when saving", async () => {
    const repository = new PluginDataRepository(
      new MemoryPluginDataStorage(),
    );

    await expect(
      repository.saveSettings(DEFAULT_PLUGIN_DATA, {
        ...DEFAULT_PLUGIN_DATA.settings,
        feedLimit: 0,
      }),
    ).rejects.toThrow();
  });
});
