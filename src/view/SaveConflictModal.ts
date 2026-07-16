import { type App, Modal, Setting } from "obsidian";

export type SaveConflictChoice = "open" | "overwrite" | "cancel";

export function askSaveConflict(
  app: App,
  path: string,
): Promise<SaveConflictChoice> {
  return new Promise((resolve) => {
    new SaveConflictModal(app, path, resolve).open();
  });
}

class SaveConflictModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly path: string,
    private readonly resolveChoice: (choice: SaveConflictChoice) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("回答已经保存");
    this.contentEl.createEl("p", {
      text: "Vault 中已经存在相同知乎回答 ID 的笔记。请选择打开现有笔记或明确覆盖。",
    });
    this.contentEl.createEl("code", { text: this.path });
    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("取消").onClick(() => this.finish("cancel")),
      )
      .addButton((button) =>
        button.setButtonText("打开现有笔记").onClick(() => this.finish("open")),
      )
      .addButton((button) => {
        button.buttonEl.addClass("mod-warning");
        button.setButtonText("覆盖").onClick(() => {
          this.finish("overwrite");
        });
      });
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.resolveChoice("cancel");
    }
  }

  private finish(choice: SaveConflictChoice): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.resolveChoice(choice);
    this.close();
  }
}
