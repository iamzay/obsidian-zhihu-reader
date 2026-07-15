import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ItemView, type WorkspaceLeaf } from "obsidian";

import type { AnswerOrder, ReaderSnapshot, ZhihuTarget } from "@/domain/zhihu";
import type { ZhihuAuthSnapshot } from "@/auth/types";
import { zhihuHtmlToMarkdown } from "@/markdown/toMarkdown";
import {
  ReaderSession,
  type ReaderSessionOptionsProvider,
} from "@/reader/ReaderSession";
import type { ZhihuGateway } from "@/zhihu/gateway";
import {
  ReaderScreen,
  type PreparedAnswer,
  type ReaderScreenActions,
} from "@/view/reader/ReaderScreen";

export const VIEW_TYPE_ZHIHU_ANSWERS = "zhihu-answers-view";

export interface ZhihuAnswersViewActions {
  readonly openUrlModal: () => void;
  readonly openFromClipboard: () => void;
}

export class ZhihuAnswersView extends ItemView {
  private root: Root | null = null;
  private readonly session: ReaderSession;
  private unsubscribeSession: (() => void) | null = null;
  private snapshot: ReaderSnapshot;
  private authSnapshot: ZhihuAuthSnapshot;
  private previousAnswerId: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    gateway: ZhihuGateway,
    optionsProvider: ReaderSessionOptionsProvider,
    private readonly actions: ZhihuAnswersViewActions,
    initialAuth: ZhihuAuthSnapshot,
  ) {
    super(leaf);
    this.session = new ReaderSession(gateway, optionsProvider);
    this.snapshot = this.session.snapshot();
    this.authSnapshot = initialAuth;
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
    this.unsubscribeSession = this.session.subscribe((snapshot) => {
      const currentAnswerId = snapshot.answers[snapshot.currentIndex]?.id ?? null;
      const shouldResetScroll =
        this.previousAnswerId !== null && currentAnswerId !== this.previousAnswerId;
      this.previousAnswerId = currentAnswerId;
      this.snapshot = snapshot;
      this.render();
      if (shouldResetScroll) {
        window.requestAnimationFrame(() => {
          this.contentEl
            .querySelector(".zhihu-answer-card")
            ?.scrollIntoView({ block: "start" });
        });
      }
    });
    this.render();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.session.dispose();
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }

  async openTarget(target: ZhihuTarget): Promise<void> {
    await this.session.open(target);
  }

  setAuthSnapshot(snapshot: ZhihuAuthSnapshot): void {
    this.authSnapshot = snapshot;
    this.render();
  }

  private preparedAnswer(): PreparedAnswer | null {
    const answer = this.snapshot.answers[this.snapshot.currentIndex];
    if (answer === undefined) {
      return null;
    }
    try {
      return {
        answer,
        markdown: zhihuHtmlToMarkdown(answer.contentHtml),
        conversionError: null,
      };
    } catch (error: unknown) {
      return {
        answer,
        markdown: null,
        conversionError:
          error instanceof Error ? error.message : "回答正文无法转换为 Markdown。",
      };
    }
  }

  private questionMarkdown(): string | null {
    const html = this.snapshot.question?.detailHtml ?? "";
    if (html.length === 0) {
      return null;
    }
    try {
      return zhihuHtmlToMarkdown(html);
    } catch {
      return null;
    }
  }

  private readerActions(): ReaderScreenActions {
    return {
      ...this.actions,
      retry: () => {
        if (this.snapshot.target !== null) {
          void this.session.open(this.snapshot.target);
        }
      },
      previous: () => this.session.previous(),
      next: () => {
        void this.session.next();
      },
      changeOrder: (order: AnswerOrder) => {
        void this.session.changeOrder(order);
      },
      returnToAnchor: () => this.session.returnToAnchor(),
      retryNavigation: () => {
        void this.session.retryNavigation();
      },
    };
  }

  private render(): void {
    this.root?.render(
      <StrictMode>
        <ReaderScreen
          app={this.app}
          snapshot={this.snapshot}
          preparedAnswer={this.preparedAnswer()}
          questionMarkdown={this.questionMarkdown()}
          auth={this.authSnapshot}
          actions={this.readerActions()}
        />
      </StrictMode>,
    );
  }
}
