import { Plugin } from "obsidian";

import { VIEW_TYPE_ZHIHU_ANSWERS, ZhihuAnswersView } from "@/view/ZhihuAnswersView";

export default class ZhihuAnswersPlugin extends Plugin {
  override onload(): void {
    this.registerView(
      VIEW_TYPE_ZHIHU_ANSWERS,
      (leaf) => new ZhihuAnswersView(leaf),
    );

    this.addRibbonIcon("book-open-text", "Open Zhihu Answers", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-zhihu-answers",
      name: "Open reader",
      callback: () => {
        void this.activateView();
      },
    });
  }

  override onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ZHIHU_ANSWERS);
  }

  private async activateView(): Promise<void> {
    const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_ZHIHU_ANSWERS)[0];
    const leaf = existingLeaf ?? this.app.workspace.getLeaf(true);

    await leaf.setViewState({
      type: VIEW_TYPE_ZHIHU_ANSWERS,
      active: true,
    });
    await this.app.workspace.revealLeaf(leaf);
  }
}
