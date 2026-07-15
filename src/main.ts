import { Notice, Plugin, TFile } from "obsidian";

import { renderQrCodeDataUrl } from "@/auth/QrCodeRenderer";
import { ZhihuAuthSession } from "@/auth/ZhihuAuthSession";
import type { PersistedZhihuAuth, ZhihuAuthSnapshot } from "@/auth/types";
import type { AnswerDocument, ZhihuTarget } from "@/domain/zhihu";
import { QuestionHistory } from "@/history/QuestionHistory";
import { AnswerNoteWriter } from "@/save/AnswerNoteWriter";
import { ObsidianAnswerNoteStorage } from "@/save/ObsidianAnswerNoteStorage";
import { ObsidianMediaDownloader } from "@/save/ObsidianMediaDownloader";
import { PluginDataRepository } from "@/settings/PluginDataRepository";
import {
  type PluginData,
  type PluginSettings,
  PluginSettingsSchema,
} from "@/settings/data";
import { ObsidianPluginDataStorage } from "@/settings/ObsidianPluginDataStorage";
import { ZhihuAnswersSettingTab } from "@/settings/ZhihuAnswersSettingTab";
import { HttpZhihuGateway } from "@/zhihu/gateway";
import { ZhihuTargetParser } from "@/zhihu/targetParser";
import { ObsidianZhihuTransport } from "@/zhihu/transport";
import {
  VIEW_TYPE_ZHIHU_ANSWERS,
  ZHIHU_READER_ICON,
  ZhihuAnswersView,
} from "@/view/ZhihuAnswersView";
import { ZhihuUrlModal } from "@/view/ZhihuUrlModal";
import { askSaveConflict } from "@/view/SaveConflictModal";

export default class ZhihuAnswersPlugin extends Plugin {
  private readonly targetParser = new ZhihuTargetParser();
  private dataRepository!: PluginDataRepository;
  private pluginData!: PluginData;
  private authSession!: ZhihuAuthSession;
  private settingTab!: ZhihuAnswersSettingTab;
  private dataDiagnostic: string | null = null;
  private questionHistory!: QuestionHistory;
  private dataWriteQueue: Promise<void> = Promise.resolve();
  private answerNoteWriter!: AnswerNoteWriter;

  override async onload(): Promise<void> {
    this.dataRepository = new PluginDataRepository(
      new ObsidianPluginDataStorage(this),
    );
    const loaded = await this.dataRepository.load();
    this.pluginData = loaded.data;
    this.dataDiagnostic = loaded.diagnostic;
    if (loaded.diagnostic !== null) {
      console.warn(`[Zhihu Reader] ${loaded.diagnostic}`);
      new Notice("Zhihu Reader 的部分配置无效，已恢复默认值。");
    }
    this.questionHistory = new QuestionHistory(
      this.pluginData.history,
      {
        limit: this.pluginData.settings.historyLimit,
      },
      {
        save: async (history) => {
          await this.persistHistory(history);
        },
      },
    );

    const transport = new ObsidianZhihuTransport();
    this.authSession = new ZhihuAuthSession(
      transport,
      {
        save: async (auth) => {
          await this.persistAuth(auth);
        },
      },
      renderQrCodeDataUrl,
    );
    const gateway = new HttpZhihuGateway(transport, {
      getCookieHeader: () => this.authSession.getCookieHeader(),
    });
    this.answerNoteWriter = new AnswerNoteWriter(
      new ObsidianAnswerNoteStorage(this.app),
      new ObsidianMediaDownloader(),
    );

    this.registerView(
      VIEW_TYPE_ZHIHU_ANSWERS,
      (leaf) =>
        new ZhihuAnswersView(
          leaf,
          gateway,
          () => ({
            feedLimit: this.pluginData.settings.feedLimit,
            order: this.pluginData.settings.answerOrder,
          }),
          {
            openUrlModal: () => this.openUrlModal(),
            openFromClipboard: () => {
              void this.openFromClipboard();
            },
            recordHistory: (question) => {
              void this.questionHistory.record(question).catch(() => {
                new Notice("查询历史暂时无法保存，后续写入时会再次尝试。");
              });
            },
            removeHistory: (questionId) => {
              void this.questionHistory.remove(questionId).catch(() => {
                new Notice("删除查询历史失败，请稍后重试。");
              });
            },
            clearHistory: () => {
              void this.questionHistory.clear().catch(() => {
                new Notice("清空查询历史失败，请稍后重试。");
              });
            },
            saveAnswer: async (answer) => await this.saveAnswer(answer),
            openNote: (path) => {
              void this.openNote(path).catch((error: unknown) => {
                new Notice(
                  error instanceof Error ? error.message : "无法打开回答笔记。",
                );
              });
            },
          },
          this.authSession.snapshot(),
          this.questionHistory.list(),
        ),
    );

    this.settingTab = new ZhihuAnswersSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.authSession.subscribe((snapshot) => {
      this.settingTab.display();
      for (const leaf of this.app.workspace.getLeavesOfType(
        VIEW_TYPE_ZHIHU_ANSWERS,
      )) {
        if (leaf.view instanceof ZhihuAnswersView) {
          leaf.view.setAuthSnapshot(snapshot);
        }
      }
    });
    this.questionHistory.subscribe((entries) => {
      for (const leaf of this.app.workspace.getLeavesOfType(
        VIEW_TYPE_ZHIHU_ANSWERS,
      )) {
        if (leaf.view instanceof ZhihuAnswersView) {
          leaf.view.setHistoryEntries(entries);
        }
      }
    });

    this.addRibbonIcon(ZHIHU_READER_ICON, "打开 Zhihu Reader", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-zhihu-content",
      name: "打开知乎内容",
      callback: () => this.openUrlModal(),
    });

    this.addCommand({
      id: "save-current-zhihu-answer",
      name: "保存当前回答",
      checkCallback: (checking) => {
        const view = this.activeReaderView();
        if (view === null || !view.hasCurrentAnswer()) {
          return false;
        }
        if (!checking) {
          void view.saveCurrentAnswer();
        }
        return true;
      },
    });

    this.addCommand({
      id: "show-zhihu-question-history",
      name: "查看历史列表",
      callback: () => {
        void this.showHistory();
      },
    });

    this.addCommand({
      id: "show-zhihu-daily-hot-list",
      name: "查看每日热榜",
      callback: () => {
        void this.showDailyHotList();
      },
    });

    this.addCommand({
      id: "search-zhihu-answers",
      name: "搜索知乎回答",
      callback: () => {
        void this.showSearch();
      },
    });

    this.addCommand({
      id: "open-zhihu-content-from-clipboard",
      name: "从剪贴板打开",
      callback: () => {
        void this.openFromClipboard();
      },
    });

    void this.authSession.verifyStoredSession(this.pluginData.auth);
  }

  override onunload(): void {
    this.authSession.dispose();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ZHIHU_ANSWERS);
  }

  getSettings(): PluginSettings {
    return { ...this.pluginData.settings };
  }

  getDataDiagnostic(): string | null {
    return this.dataDiagnostic;
  }

  getAuthSnapshot(): ZhihuAuthSnapshot {
    return this.authSession.snapshot();
  }

  startQrLogin(): Promise<void> {
    return this.authSession.startQrLogin();
  }

  cancelQrLogin(): void {
    this.authSession.cancel();
  }

  logout(): Promise<void> {
    return this.authSession.logout();
  }

  async updateSettings(patch: Partial<PluginSettings>): Promise<void> {
    const settings = PluginSettingsSchema.parse({
      ...this.pluginData.settings,
      ...patch,
    });
    await this.enqueueDataWrite(async (current) =>
      await this.dataRepository.saveSettings(current, settings),
    );
    await this.questionHistory.updatePolicy({
      limit: settings.historyLimit,
    });
    this.dataDiagnostic = null;
  }

  private async persistAuth(auth: PersistedZhihuAuth): Promise<void> {
    await this.enqueueDataWrite(async (current) =>
      await this.dataRepository.saveAuth(current, auth),
    );
  }

  private async persistHistory(
    history: ReturnType<QuestionHistory["list"]>,
  ): Promise<void> {
    await this.enqueueDataWrite(async (current) =>
      await this.dataRepository.saveHistory(current, history),
    );
  }

  private enqueueDataWrite(
    write: (current: PluginData) => Promise<PluginData>,
  ): Promise<void> {
    const operation = this.dataWriteQueue
      .catch(() => undefined)
      .then(async () => {
        this.pluginData = await write(this.pluginData);
      });
    this.dataWriteQueue = operation;
    return operation;
  }

  private async saveAnswer(
    answer: AnswerDocument,
  ): Promise<{
    status: "saved" | "cancelled";
    path?: string;
    warnings?: readonly string[];
  }> {
    const settings = this.pluginData.settings;
    const options = {
      saveFolder: settings.saveFolder,
      notePathTemplate: settings.notePathTemplate,
      imageMode: settings.imageMode,
      attachmentLocation: settings.attachmentLocation,
      attachmentFolder: settings.attachmentFolder,
    } as const;
    let result = await this.answerNoteWriter.save(answer, options);
    if (result.status === "conflict") {
      const choice = await askSaveConflict(this.app, result.path);
      if (choice === "cancel") {
        return { status: "cancelled" };
      }
      if (choice === "open") {
        await this.openNote(result.path);
        return { status: "saved", path: result.path, warnings: [] };
      }
      result = await this.answerNoteWriter.save(answer, {
        ...options,
        overwritePath: result.path,
      });
      if (result.status === "conflict") {
        throw new Error("回答笔记在确认期间发生变化，请重新保存。");
      }
    }
    const postSaveMessages: string[] = [];
    if (settings.openNoteAfterSave) {
      try {
        await this.openNote(result.path);
      } catch (error: unknown) {
        postSaveMessages.push(`无法自动打开：${errorMessage(error)}`);
      }
    }
    if (result.warnings.length > 0) {
      postSaveMessages.push(
        `${result.warnings.length} 张图片下载失败并保留远程链接`,
      );
    }
    new Notice(
      postSaveMessages.length === 0
        ? "回答已保存。"
        : `回答已保存；${postSaveMessages.join("；")}。`,
    );
    return {
      status: "saved",
      path: result.path,
      warnings: result.warnings,
    };
  }

  private async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error("保存的回答笔记已不存在。");
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  private activeReaderView(): ZhihuAnswersView | null {
    const active = this.app.workspace.getActiveViewOfType(ZhihuAnswersView);
    if (active !== null) {
      return active;
    }
    const leaf = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_ZHIHU_ANSWERS,
    )[0];
    return leaf?.view instanceof ZhihuAnswersView ? leaf.view : null;
  }

  private openUrlModal(initialValue = ""): void {
    new ZhihuUrlModal(
      this.app,
      this.targetParser,
      ({ target }) => {
        void this.activateView(target);
      },
      initialValue,
    ).open();
  }

  private async openFromClipboard(): Promise<void> {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      new Notice("无法读取剪贴板，请检查系统权限后重试。");
      return;
    }

    try {
      const target = this.targetParser.parse(text);
      await this.activateView(target);
      return;
    } catch {
      const found = this.targetParser.findFirst(text);
      if (found !== null) {
        this.openUrlModal(found.url);
        return;
      }
    }

    new Notice("剪贴板中没有可识别的知乎问题或回答链接。");
  }

  private async activateView(target?: ZhihuTarget): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_ZHIHU_ANSWERS,
    )[0];
    const leaf = existingLeaf ?? this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_ZHIHU_ANSWERS,
      active: true,
    });
    await this.app.workspace.revealLeaf(leaf);

    if (target !== undefined && leaf.view instanceof ZhihuAnswersView) {
      await leaf.view.openTarget(target);
    }
  }

  private async showHistory(): Promise<void> {
    await this.activateView();
    const leaf = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_ZHIHU_ANSWERS,
    )[0];
    if (leaf?.view instanceof ZhihuAnswersView) {
      leaf.view.openHistoryPopover();
    }
  }

  private async showDailyHotList(): Promise<void> {
    await this.activateView();
    const leaf = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_ZHIHU_ANSWERS,
    )[0];
    if (leaf?.view instanceof ZhihuAnswersView) {
      leaf.view.openDailyHotListPopover();
    }
  }

  private async showSearch(): Promise<void> {
    await this.activateView();
    const leaf = this.app.workspace.getLeavesOfType(
      VIEW_TYPE_ZHIHU_ANSWERS,
    )[0];
    if (leaf?.view instanceof ZhihuAnswersView) {
      leaf.view.openSearchPopover();
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
