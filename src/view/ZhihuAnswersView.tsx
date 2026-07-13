import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ItemView, type WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_ZHIHU_ANSWERS = "zhihu-answers-view";

function ZhihuAnswersApp(): React.JSX.Element {
  return (
    <main className="zhihu-answers">
      <div className="zhihu-answers__empty-state">
        <div className="zhihu-answers__mark" aria-hidden="true">
          知
        </div>
        <h2>Zhihu Answers</h2>
        <p>知乎问题与回答阅读器的插件骨架已经就绪。</p>
      </div>
    </main>
  );
}

export class ZhihuAnswersView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_ZHIHU_ANSWERS;
  }

  getDisplayText(): string {
    return "Zhihu Answers";
  }

  override getIcon(): string {
    return "book-open-text";
  }

  override onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <ZhihuAnswersApp />
      </StrictMode>,
    );
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }
}
