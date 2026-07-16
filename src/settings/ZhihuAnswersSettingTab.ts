import { type App, PluginSettingTab, Setting } from "obsidian";

import type ZhihuAnswersPlugin from "@/main";

export class ZhihuAnswersSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly zhihuPlugin: ZhihuAnswersPlugin) {
    super(app, zhihuPlugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Zhihu Reader").setHeading();

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

    new Setting(containerEl).setName("阅读").setHeading();

    new Setting(containerEl)
      .setName("每批回答数")
      .setDesc("问题回答 feed 每次请求的数量，范围为 1–20。")
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(settings.feedLimit)
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
      .setName("历史条目上限")
      .setDesc("最多保留的问题查询记录数量。")
      .addSlider((slider) =>
        slider
          .setLimits(1, 500, 1)
          .setValue(settings.historyLimit)
          .onChange((value) => {
            void this.zhihuPlugin.updateSettings({ historyLimit: value });
          }),
      );

    new Setting(containerEl).setName("保存").setHeading();

    new Setting(containerEl)
      .setName("回答保存目录")
      .setDesc("相对于当前 Vault 根目录。")
      .addText((text) =>
        text
          .setPlaceholder("Zhihu Reader")
          .setValue(settings.saveFolder)
          .onChange((value) => {
            const saveFolder = value.trim();
            if (saveFolder.length > 0) {
              void this.zhihuPlugin.updateSettings({ saveFolder });
            }
          }),
      );

    new Setting(containerEl)
      .setName("文件路径模板")
      .setDesc("支持 {问题标题}、{作者名}、{回答ID} 和 {问题ID}。")
      .addText((text) =>
        text.setValue(settings.notePathTemplate).onChange((value) => {
          const notePathTemplate = value.trim();
          if (notePathTemplate.length > 0) {
            void this.zhihuPlugin.updateSettings({ notePathTemplate });
          }
        }),
      );

    new Setting(containerEl)
      .setName("保存后自动打开笔记")
      .addToggle((toggle) =>
        toggle.setValue(settings.openNoteAfterSave).onChange((value) => {
          void this.zhihuPlugin.updateSettings({ openNoteAfterSave: value });
        }),
      );

    new Setting(containerEl)
      .setName("是否下载图片到 Vault")
      .setDesc("临时阅读始终使用远程图片；只有保存回答时才会下载附件。")
      .addToggle((toggle) =>
        toggle
          .setValue(settings.imageMode === "vault")
          .onChange((shouldDownload) => {
            void this.zhihuPlugin
              .updateSettings({
                imageMode: shouldDownload ? "vault" : "remote",
              })
              .then(() => this.display());
          }),
      );

    if (settings.imageMode === "vault") {
      new Setting(containerEl)
        .setName("附件位置")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("obsidian", "遵循 Obsidian 附件设置")
            .addOption("custom", "使用独立目录")
            .setValue(settings.attachmentLocation)
            .onChange((value) => {
              if (value === "obsidian" || value === "custom") {
                void this.zhihuPlugin
                  .updateSettings({ attachmentLocation: value })
                  .then(() => this.display());
              }
            }),
        );
      if (settings.attachmentLocation === "custom") {
        new Setting(containerEl)
          .setName("附件目录")
          .setDesc(
            "相对于 Vault 根目录；支持 {问题标题}、{作者名}、{回答ID} 和 {问题ID}。",
          )
          .addText((text) =>
            text.setValue(settings.attachmentFolder).onChange((value) => {
              const attachmentFolder = value.trim();
              if (attachmentFolder.length > 0) {
                void this.zhihuPlugin.updateSettings({ attachmentFolder });
              }
            }),
          );
      }
    }
  }

  private renderAuthSettings(): void {
    const { containerEl } = this;
    const auth = this.zhihuPlugin.getAuthSnapshot();
    new Setting(containerEl).setName("知乎登录").setHeading();

    const authSection = containerEl.createDiv({
      cls: "zhihu-settings-auth",
      attr: { "aria-live": "polite" },
    });
    const webViewerAvailability =
      this.zhihuPlugin.getWebViewerAvailability();
    const webViewerStatus = webViewerAvailability === "enabled"
      ? "已启用"
      : webViewerAvailability === "unsupported"
        ? "移动端不可用"
        : "尚未启用";

    new Setting(authSection)
      .setName("登录前准备")
      .setDesc(
        webViewerAvailability === "unsupported"
          ? "Web viewer 仅支持桌面端，因此推荐的网页登录在移动端不可用；当前仍可尝试二维码 API 登录。"
          : `两种登录方式都需要先在“设置 → 核心插件”中启用 Web viewer（网页浏览器）。当前状态：${webViewerStatus}。`,
      );
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
      auth.phase === "waiting-web-login" ||
      auth.phase === "waiting-scan" ||
      auth.phase === "waiting-confirm" ||
      auth.phase === "verifying"
    ) {
      new Setting(authSection).addButton((button) =>
        button.setButtonText("取消").onClick(() => {
          this.zhihuPlugin.cancelLogin();
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

    new Setting(authSection)
      .setName("网页登录（推荐）")
      .setDesc("请在 Obsidian Web viewer 中打开知乎登录页并登录。")
      .addButton((button) =>
        button
          .setButtonText(
            webViewerAvailability === "unsupported"
              ? "仅桌面端可用"
              : webViewerAvailability === "disabled"
                ? "请先启用 Web viewer"
                : "打开网页登录",
          )
          .setCta()
          .setDisabled(webViewerAvailability !== "enabled")
          .onClick(() => {
            void this.zhihuPlugin.startWebViewerLogin();
          }),
      );

    new Setting(authSection)
      .setName("二维码 API 登录")
      .setDesc(
        "使用插件当前的二维码接口完成登录，作为网页登录不可用时的备用方式；开始前同样请确认已启用 Web viewer 核心插件。",
      )
      .addButton((button) =>
        button.setButtonText("生成登录二维码").onClick(() => {
          void this.zhihuPlugin.startQrLogin();
        }),
      );
  }
}

function authStatusText(phase: string): string {
  switch (phase) {
    case "expired":
      return "登录已过期，请重新登录后继续使用阅读功能。";
    case "cancelled":
      return "已取消登录。";
    case "waiting-web-login":
      return "请在 Web viewer 中完成知乎登录。";
    case "risk-control":
      return "知乎要求先完成网络环境验证。";
    case "error":
      return "登录发生错误，请重新登录后继续使用阅读功能。";
    default:
      return "当前未登录；请先登录知乎再使用阅读功能。";
  }
}
