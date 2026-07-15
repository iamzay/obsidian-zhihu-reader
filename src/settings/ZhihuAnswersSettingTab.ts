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

    containerEl.createEl("h3", { text: "阅读" });
    const settings = this.zhihuPlugin.getSettings();

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
}
