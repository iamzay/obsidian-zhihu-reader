import { Notice, Plugin } from "obsidian";

import { renderQrCodeDataUrl } from "@/auth/QrCodeRenderer";
import { ZhihuAuthSession } from "@/auth/ZhihuAuthSession";
import type { PersistedZhihuAuth, ZhihuAuthSnapshot } from "@/auth/types";
import type { ZhihuTarget } from "@/domain/zhihu";
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
  ZhihuAnswersView,
} from "@/view/ZhihuAnswersView";
import { ZhihuUrlModal } from "@/view/ZhihuUrlModal";

export default class ZhihuAnswersPlugin extends Plugin {
  private readonly targetParser = new ZhihuTargetParser();
  private dataRepository!: PluginDataRepository;
  private pluginData!: PluginData;
  private authSession!: ZhihuAuthSession;
  private settingTab!: ZhihuAnswersSettingTab;
  private dataDiagnostic: string | null = null;

  override async onload(): Promise<void> {
    this.dataRepository = new PluginDataRepository(
      new ObsidianPluginDataStorage(this),
    );
    const loaded = await this.dataRepository.load();
    this.pluginData = loaded.data;
    this.dataDiagnostic = loaded.diagnostic;
    if (loaded.diagnostic !== null) {
      console.warn(`[Zhihu Answers] ${loaded.diagnostic}`);
      new Notice("Zhihu Answers 的部分配置无效，已恢复默认值。");
    }

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
          },
          this.authSession.snapshot(),
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

    this.addRibbonIcon("book-open-text", "打开 Zhihu Answers", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-zhihu-content",
      name: "打开知乎内容",
      callback: () => this.openUrlModal(),
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
    this.pluginData = await this.dataRepository.saveSettings(
      this.pluginData,
      settings,
    );
    this.dataDiagnostic = null;
  }

  private async persistAuth(auth: PersistedZhihuAuth): Promise<void> {
    this.pluginData = await this.dataRepository.saveAuth(this.pluginData, auth);
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
}
