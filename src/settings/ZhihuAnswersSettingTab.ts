import {
  type App,
  PluginSettingTab,
  type SettingDefinition,
  type SettingDefinitionItem,
} from "obsidian";

import type ZhihuAnswersPlugin from "@/main";

export class ZhihuAnswersSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly zhihuPlugin: ZhihuAnswersPlugin) {
    super(app, zhihuPlugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const settings = this.zhihuPlugin.getSettings();
    const diagnostic = this.zhihuPlugin.getDataDiagnostic();

    return [
      {
        type: "group",
        heading: "Zhihu Reader",
        items: diagnostic === null
          ? []
          : [
              {
                name: "配置提示",
                desc: diagnostic,
                render: (setting) => {
                  setting.settingEl.addClass("zhihu-settings__diagnostic");
                },
              },
            ],
      },
      {
        type: "group",
        heading: "知乎登录",
        items: this.authSettingDefinitions(),
      },
      {
        type: "group",
        heading: "阅读",
        items: [
          {
            name: "每批回答数",
            desc: "问题回答 feed 每次请求的数量，范围为 1–20。",
            render: (setting) => {
              setting.addSlider((slider) =>
                slider
                  .setLimits(1, 20, 1)
                  .setValue(settings.feedLimit)
                  .onChange((value) => {
                    void this.zhihuPlugin.updateSettings({ feedLimit: value });
                  }),
              );
            },
          },
          {
            name: "默认排序",
            desc: "打开问题时使用的回答排序。",
            render: (setting) => {
              setting.addDropdown((dropdown) =>
                dropdown
                  .addOption("default", "综合排序")
                  .addOption("updated", "最近更新")
                  .setValue(settings.answerOrder)
                  .onChange((value) => {
                    if (value === "default" || value === "updated") {
                      void this.zhihuPlugin.updateSettings({
                        answerOrder: value,
                      });
                    }
                  }),
              );
            },
          },
          {
            name: "历史条目上限",
            desc: "最多保留的问题查询记录数量。",
            render: (setting) => {
              setting.addSlider((slider) =>
                slider
                  .setLimits(1, 500, 1)
                  .setValue(settings.historyLimit)
                  .onChange((value) => {
                    void this.zhihuPlugin.updateSettings({
                      historyLimit: value,
                    });
                  }),
              );
            },
          },
        ],
      },
      {
        type: "group",
        heading: "保存",
        items: [
          {
            name: "回答保存目录",
            desc: "相对于当前 Vault 根目录。",
            render: (setting) => {
              setting.addText((text) =>
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
            },
          },
          {
            name: "文件路径模板",
            desc: "支持 {问题标题}、{作者名}、{回答ID} 和 {问题ID}。",
            render: (setting) => {
              setting.addText((text) =>
                text.setValue(settings.notePathTemplate).onChange((value) => {
                  const notePathTemplate = value.trim();
                  if (notePathTemplate.length > 0) {
                    void this.zhihuPlugin.updateSettings({ notePathTemplate });
                  }
                }),
              );
            },
          },
          {
            name: "保存后自动打开笔记",
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(settings.openNoteAfterSave)
                  .onChange((value) => {
                    void this.zhihuPlugin.updateSettings({
                      openNoteAfterSave: value,
                    });
                  }),
              );
            },
          },
          {
            name: "是否下载图片到 Vault",
            desc: "临时阅读始终使用远程图片；只有保存回答时才会下载附件。",
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(settings.imageMode === "vault")
                  .onChange((shouldDownload) => {
                    void this.zhihuPlugin
                      .updateSettings({
                        imageMode: shouldDownload ? "vault" : "remote",
                      })
                      .then(() => this.update());
                  }),
              );
            },
          },
          {
            name: "附件位置",
            visible: settings.imageMode === "vault",
            render: (setting) => {
              setting.addDropdown((dropdown) =>
                dropdown
                  .addOption("obsidian", "遵循 Obsidian 附件设置")
                  .addOption("custom", "使用独立目录")
                  .setValue(settings.attachmentLocation)
                  .onChange((value) => {
                    if (value === "obsidian" || value === "custom") {
                      void this.zhihuPlugin
                        .updateSettings({ attachmentLocation: value })
                        .then(() => this.update());
                    }
                  }),
              );
            },
          },
          {
            name: "附件目录",
            desc: "相对于 Vault 根目录；支持 {问题标题}、{作者名}、{回答ID} 和 {问题ID}。",
            visible:
              settings.imageMode === "vault" &&
              settings.attachmentLocation === "custom",
            render: (setting) => {
              setting.addText((text) =>
                text.setValue(settings.attachmentFolder).onChange((value) => {
                  const attachmentFolder = value.trim();
                  if (attachmentFolder.length > 0) {
                    void this.zhihuPlugin.updateSettings({ attachmentFolder });
                  }
                }),
              );
            },
          },
        ],
      },
    ];
  }

  private authSettingDefinitions(): SettingDefinition[] {
    const auth = this.zhihuPlugin.getAuthSnapshot();
    const availability = this.zhihuPlugin.getWebViewerAvailability();
    const availabilityText = availability === "enabled"
      ? "已启用"
      : availability === "unsupported"
        ? "移动端不可用"
        : "尚未启用";
    const definitions: SettingDefinition[] = [
      {
        name: "登录前准备",
        desc:
          availability === "unsupported"
            ? "Web viewer 仅支持桌面端，因此推荐的网页登录在移动端不可用；当前仍可尝试二维码 API 登录。"
            : `两种登录方式都需要先在“设置 → 核心插件”中启用 Web viewer（网页浏览器）。当前状态：${availabilityText}。`,
      },
      {
        name: "登录状态",
        desc: auth.message ?? authStatusText(auth.phase),
        render: (setting) => {
          if (auth.qrDataUrl !== null) {
            setting.controlEl.createEl("img", {
              cls: "zhihu-settings-auth__qr",
              attr: {
                src: auth.qrDataUrl,
                alt: "知乎登录二维码",
              },
            });
          }
        },
      },
    ];

    if (auth.phase === "authenticated") {
      definitions.push({
        name: auth.profile?.name ?? "已登录知乎",
        desc: "登录 Cookie 仅保存在插件私有数据中。",
        render: (setting) => {
          setting.addButton((button) =>
            button.setButtonText("退出登录").onClick(() => {
              void this.zhihuPlugin.logout();
            }),
          );
        },
      });
      return definitions;
    }

    if (isLoginPending(auth.phase)) {
      definitions.push({
        name: "正在登录",
        render: (setting) => {
          setting.addButton((button) =>
            button.setButtonText("取消").onClick(() => {
              this.zhihuPlugin.cancelLogin();
            }),
          );
        },
      });
      return definitions;
    }

    if (auth.phase === "risk-control" && auth.riskControlUrl !== null) {
      definitions.push({
        name: "完成网络环境验证",
        render: (setting) => {
          setting.addButton((button) =>
            button.setButtonText("在浏览器完成验证").onClick(() => {
              window.open(
                auth.riskControlUrl ?? "",
                "_blank",
                "noopener,noreferrer",
              );
            }),
          );
        },
      });
    }

    definitions.push(
      {
        name: "网页登录（推荐）",
        desc: "请在 Obsidian Web viewer 中打开知乎登录页并登录。",
        render: (setting) => {
          setting.addButton((button) =>
            button
              .setButtonText(
                availability === "unsupported"
                  ? "仅桌面端可用"
                  : availability === "disabled"
                    ? "请先启用 Web viewer"
                    : "打开网页登录",
              )
              .setCta()
              .setDisabled(availability !== "enabled")
              .onClick(() => {
                void this.zhihuPlugin.startWebViewerLogin();
              }),
          );
        },
      },
      {
        name: "二维码 API 登录",
        desc: "使用二维码接口完成登录，作为网页登录不可用时的备用方式；开始前同样请确认已启用 Web viewer 核心插件。",
        render: (setting) => {
          setting.addButton((button) =>
            button.setButtonText("生成登录二维码").onClick(() => {
              void this.zhihuPlugin.startQrLogin();
            }),
          );
        },
      },
    );
    return definitions;
  }
}

function isLoginPending(phase: string): boolean {
  return (
    phase === "creating-qr" ||
    phase === "waiting-web-login" ||
    phase === "waiting-scan" ||
    phase === "waiting-confirm" ||
    phase === "verifying"
  );
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
