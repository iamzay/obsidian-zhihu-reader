import { type App, Modal, Setting } from "obsidian";

import type { ZhihuTarget } from "@/domain/zhihu";
import {
  ZhihuTargetParseError,
  type ZhihuTargetParser,
} from "@/zhihu/targetParser";

export interface ZhihuUrlModalResult {
  readonly target: ZhihuTarget;
  readonly url: string;
}

export class ZhihuUrlModal extends Modal {
  private inputEl: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly parser: ZhihuTargetParser,
    private readonly onSubmit: (result: ZhihuUrlModalResult) => void,
    private readonly initialValue = "",
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("打开知乎问题或回答");
    this.contentEl.addClass("zhihu-url-modal");
    this.contentEl.createEl("p", {
      cls: "zhihu-url-modal__help",
      text: "支持知乎问题链接和回答链接。查询参数、锚点与尾部斜杠均可保留。",
    });

    const input = this.contentEl.createEl("input", {
      cls: "zhihu-url-modal__input",
      type: "url",
      placeholder: "https://www.zhihu.com/question/…/answer/…",
      value: this.initialValue,
      attr: { "aria-label": "知乎问题或回答链接" },
    });
    this.inputEl = input;
    this.errorEl = this.contentEl.createDiv({
      cls: "zhihu-url-modal__error",
      attr: { role: "alert", "aria-live": "polite" },
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("取消")
          .onClick(() => {
            this.close();
          }),
      )
      .addButton((button) =>
        button
          .setButtonText("打开阅读器")
          .setCta()
          .onClick(() => {
            this.submit();
          }),
      );

    input.addEventListener("input", () => this.showError(null));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        this.submit();
      }
    });
    window.setTimeout(() => input.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
    this.inputEl = null;
    this.errorEl = null;
  }

  private submit(): void {
    const value = this.inputEl?.value ?? "";
    try {
      const target = this.parser.parse(value);
      this.onSubmit({ target, url: value.trim() });
      this.close();
    } catch (error: unknown) {
      this.showError(
        error instanceof ZhihuTargetParseError
          ? error.message
          : "无法解析该链接，请重试。",
      );
      this.inputEl?.focus();
    }
  }

  private showError(message: string | null): void {
    if (this.errorEl === null) {
      return;
    }
    this.errorEl.setText(message ?? "");
    this.inputEl?.toggleClass("is-invalid", message !== null);
  }
}
