import { type App, PluginSettingTab, Setting } from "obsidian";

import type ZhihuAnswersPlugin from "@/main";

export class ZhihuAnswersSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly zhihuPlugin: ZhihuAnswersPlugin) {
    super(app, zhihuPlugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Zhihu Answers" });

    const diagnostic = this.zhihuPlugin.getDataDiagnostic();
    if (diagnostic !== null) {
      containerEl.createDiv({
        cls: "zhihu-settings__diagnostic",
        text: diagnostic,
        attr: { role: "status" },
      });
    }

    const settings = this.zhihuPlugin.getSettings();

    this.renderAuthSettings();

    containerEl.createEl("h3", { text: "阅读" });

    new Setting(containerEl)
      .setName("每批回答数")
      .setDesc("问题回答 feed 每次请求的数量，范围为 1–20。")
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(settings.feedLimit)
          .setDynamicTooltip()
          .onChange((value) => {
            void this.zhihuPlugin.updateSettings({ feedLimit: value });
          }),
      );

    new Setting(containerEl)
      .setName("默认排序")
      .setDesc("打开问题时使用的回答排序。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("default", "综合排序")
          .addOption("updated", "最近更新")
          .setValue(settings.answerOrder)
          .onChange((value) => {
            if (value === "default" || value === "updated") {
              void this.zhihuPlugin.updateSettings({ answerOrder: value });
            }
          }),
      );

    new Setting(containerEl)
      .setName("记录查询历史")
      .setDesc("只记录查询过的问题 ID、标题和时间，不创建 Markdown 文件。")
      .addToggle((toggle) =>
        toggle.setValue(settings.historyEnabled).onChange((value) => {
          void this.zhihuPlugin.updateSettings({ historyEnabled: value });
        }),
      );

    new Setting(containerEl)
      .setName("历史条目上限")
      .setDesc("最多保留的问题查询记录数量。")
      .addSlider((slider) =>
        slider
          .setLimits(1, 500, 1)
          .setValue(settings.historyLimit)
          .setDynamicTooltip()
          .onChange((value) => {
            void this.zhihuPlugin.updateSettings({ historyLimit: value });
          }),
      );

    containerEl.createEl("h3", { text: "保存" });
    new Setting(containerEl)
      .setName("回答保存目录")
      .setDesc("相对于当前 Vault 根目录。保存功能将在 ZA-07 启用。")
      .addText((text) =>
        text
          .setPlaceholder("Zhihu Answers")
          .setValue(settings.saveFolder)
          .onChange((value) => {
            const saveFolder = value.trim();
            if (saveFolder.length > 0) {
              void this.zhihuPlugin.updateSettings({ saveFolder });
            }
          }),
      );
  }

  private renderAuthSettings(): void {
    const { containerEl } = this;
    const auth = this.zhihuPlugin.getAuthSnapshot();
    containerEl.createEl("h3", { text: "知乎登录" });

    const authSection = containerEl.createDiv({
      cls: "zhihu-settings-auth",
      attr: { "aria-live": "polite" },
    });
    authSection.createEl("p", {
      text: auth.message ?? authStatusText(auth.phase),
    });

    if (auth.qrDataUrl !== null) {
      authSection.createEl("img", {
        cls: "zhihu-settings-auth__qr",
        attr: {
          src: auth.qrDataUrl,
          alt: "知乎登录二维码",
        },
      });
    }

    if (auth.phase === "authenticated") {
      new Setting(authSection)
        .setName(auth.profile?.name ?? "已登录知乎")
        .setDesc("登录 Cookie 仅保存在插件私有数据中。")
        .addButton((button) =>
          button.setButtonText("退出登录").onClick(() => {
            void this.zhihuPlugin.logout();
          }),
        );
      return;
    }

    if (
      auth.phase === "creating-qr" ||
      auth.phase === "waiting-scan" ||
      auth.phase === "waiting-confirm" ||
      auth.phase === "verifying"
    ) {
      new Setting(authSection).addButton((button) =>
        button.setButtonText("取消").onClick(() => {
          this.zhihuPlugin.cancelQrLogin();
        }),
      );
      return;
    }

    if (auth.phase === "risk-control" && auth.riskControlUrl !== null) {
      new Setting(authSection).addButton((button) =>
        button.setButtonText("在浏览器完成验证").onClick(() => {
          window.open(auth.riskControlUrl ?? "", "_blank", "noopener,noreferrer");
        }),
      );
    }

    new Setting(authSection).addButton((button) =>
      button.setButtonText("生成登录二维码").setCta().onClick(() => {
        void this.zhihuPlugin.startQrLogin();
      }),
    );
  }
}

function authStatusText(phase: string): string {
  switch (phase) {
    case "expired":
      return "登录已过期，当前使用匿名阅读。";
    case "cancelled":
      return "已取消登录。";
    case "risk-control":
      return "知乎要求先完成网络环境验证。";
    case "error":
      return "登录发生错误，匿名阅读仍可使用。";
    default:
      return "当前未登录；公开内容仍可匿名阅读。";
  }
}
