import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ItemView, type WorkspaceLeaf } from "obsidian";

import type {
  AnswerDocument,
  AnswerOrder,
  CommentOrder,
  ReaderSnapshot,
  ZhihuComment,
  ZhihuTarget,
} from "@/domain/zhihu";
import type { ZhihuAuthSnapshot } from "@/auth/types";
import {
  AuthorAnswerList,
  type AuthorAnswerListSnapshot,
} from "@/author/AuthorAnswerList";
import {
  AnswerCommentList,
  type AnswerCommentListSnapshot,
} from "@/comments/AnswerCommentList";
import {
  DailyHotList,
  type DailyHotListSnapshot,
} from "@/hotlist/DailyHotList";
import type {
  QuestionHistoryEntry,
} from "@/history/QuestionHistory";
import { zhihuHtmlToMarkdown } from "@/markdown/toMarkdown";
import {
  ReaderSession,
  type ReaderSessionOptionsProvider,
} from "@/reader/ReaderSession";
import type { ZhihuGateway } from "@/zhihu/gateway";
import {
  ReaderScreen,
  type AnswerSaveState,
  type PreparedAnswer,
  type ReaderScreenActions,
} from "@/view/reader/ReaderScreen";

export const VIEW_TYPE_ZHIHU_ANSWERS = "zhihu-answers-view";
export const ZHIHU_READER_ICON = "book-open";

export interface ZhihuAnswersViewActions {
  readonly openUrlModal: () => void;
  readonly openFromClipboard: () => void;
  readonly recordHistory: (question: NonNullable<ReaderSnapshot["question"]>) => void;
  readonly removeHistory: (questionId: string) => void;
  readonly clearHistory: () => void;
  readonly saveAnswer: (
    answer: AnswerDocument,
  ) => Promise<{ readonly status: "saved" | "cancelled"; readonly path?: string; readonly warnings?: readonly string[] }>;
  readonly openNote: (path: string) => void;
}

export class ZhihuAnswersView extends ItemView {
  private root: Root | null = null;
  private readonly session: ReaderSession;
  private readonly dailyHotList: DailyHotList;
  private readonly authorAnswerList: AuthorAnswerList;
  private readonly answerCommentList: AnswerCommentList;
  private unsubscribeSession: (() => void) | null = null;
  private unsubscribeDailyHotList: (() => void) | null = null;
  private unsubscribeAuthorAnswerList: (() => void) | null = null;
  private unsubscribeAnswerCommentList: (() => void) | null = null;
  private snapshot: ReaderSnapshot;
  private dailyHotListSnapshot: DailyHotListSnapshot;
  private authorAnswerListSnapshot: AuthorAnswerListSnapshot;
  private answerCommentListSnapshot: AnswerCommentListSnapshot;
  private authSnapshot: ZhihuAuthSnapshot;
  private previousAnswerId: string | null = null;
  private historyEntries: readonly QuestionHistoryEntry[];
  private isHistoryOpen = false;
  private isDailyHotListOpen = false;
  private isCommentsOpen = false;
  private shouldRecordQuery = false;
  private savingAnswerId: string | null = null;
  private readonly savedPaths = new Map<string, string>();
  private readonly saveWarnings = new Map<string, readonly string[]>();
  private readonly saveErrors = new Map<string, string>();

  constructor(
    leaf: WorkspaceLeaf,
    gateway: ZhihuGateway,
    optionsProvider: ReaderSessionOptionsProvider,
    private readonly actions: ZhihuAnswersViewActions,
    initialAuth: ZhihuAuthSnapshot,
    initialHistory: readonly QuestionHistoryEntry[],
  ) {
    super(leaf);
    this.session = new ReaderSession(gateway, optionsProvider);
    this.dailyHotList = new DailyHotList(gateway);
    this.authorAnswerList = new AuthorAnswerList(gateway);
    this.answerCommentList = new AnswerCommentList(gateway);
    this.snapshot = this.session.snapshot();
    this.dailyHotListSnapshot = this.dailyHotList.snapshot();
    this.authorAnswerListSnapshot = this.authorAnswerList.snapshot();
    this.answerCommentListSnapshot = this.answerCommentList.snapshot();
    this.authSnapshot = initialAuth;
    this.historyEntries = initialHistory;
  }

  getViewType(): string {
    return VIEW_TYPE_ZHIHU_ANSWERS;
  }

  getDisplayText(): string {
    return "Zhihu Reader";
  }

  override getIcon(): string {
    return ZHIHU_READER_ICON;
  }

  override onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.unsubscribeSession = this.session.subscribe((snapshot) => {
      const currentAnswerId = snapshot.answers[snapshot.currentIndex]?.id ?? null;
      const shouldResetScroll =
        this.previousAnswerId !== null && currentAnswerId !== this.previousAnswerId;
      if (shouldResetScroll) {
        this.isCommentsOpen = false;
      }
      this.previousAnswerId = currentAnswerId;
      this.snapshot = snapshot;
      if (
        this.shouldRecordQuery &&
        snapshot.phase === "ready" &&
        snapshot.question !== null
      ) {
        this.shouldRecordQuery = false;
        this.actions.recordHistory(snapshot.question);
      }
      this.render();
      if (shouldResetScroll) {
        window.requestAnimationFrame(() => {
          this.contentEl
            .querySelector(".zhihu-answer-card")
            ?.scrollIntoView({ block: "start" });
        });
      }
    });
    this.unsubscribeDailyHotList = this.dailyHotList.subscribe((snapshot) => {
      this.dailyHotListSnapshot = snapshot;
      this.render();
    });
    this.unsubscribeAuthorAnswerList = this.authorAnswerList.subscribe(
      (snapshot) => {
        this.authorAnswerListSnapshot = snapshot;
        this.render();
      },
    );
    this.unsubscribeAnswerCommentList = this.answerCommentList.subscribe(
      (snapshot) => {
        this.answerCommentListSnapshot = snapshot;
        this.render();
      },
    );
    this.render();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    this.unsubscribeDailyHotList?.();
    this.unsubscribeDailyHotList = null;
    this.unsubscribeAuthorAnswerList?.();
    this.unsubscribeAuthorAnswerList = null;
    this.unsubscribeAnswerCommentList?.();
    this.unsubscribeAnswerCommentList = null;
    this.session.dispose();
    this.dailyHotList.dispose();
    this.authorAnswerList.dispose();
    this.answerCommentList.dispose();
    this.root?.unmount();
    this.root = null;
    return Promise.resolve();
  }

  async openTarget(target: ZhihuTarget): Promise<void> {
    this.shouldRecordQuery = true;
    await this.session.open(target);
  }

  setHistoryEntries(entries: readonly QuestionHistoryEntry[]): void {
    this.historyEntries = entries;
    this.render();
  }

  openHistoryPopover(): void {
    this.isDailyHotListOpen = false;
    this.isHistoryOpen = true;
    this.render();
  }

  openDailyHotListPopover(): void {
    this.isHistoryOpen = false;
    this.isDailyHotListOpen = true;
    this.render();
    void this.dailyHotList.load();
  }

  setAuthSnapshot(snapshot: ZhihuAuthSnapshot): void {
    this.authSnapshot = snapshot;
    this.render();
  }

  hasCurrentAnswer(): boolean {
    return this.snapshot.answers[this.snapshot.currentIndex] !== undefined;
  }

  async saveCurrentAnswer(): Promise<void> {
    const answer = this.snapshot.answers[this.snapshot.currentIndex];
    if (answer === undefined || this.savingAnswerId !== null) {
      return;
    }
    const answerId = answer.id;
    this.savingAnswerId = answerId;
    this.saveErrors.delete(answerId);
    this.render();
    try {
      const result = await this.actions.saveAnswer(answer);
      if (result.status === "saved" && result.path !== undefined) {
        this.savedPaths.set(answerId, result.path);
        const failures = result.warnings?.length ?? 0;
        if (failures > 0) {
          this.saveWarnings.set(answerId, result.warnings ?? []);
        } else {
          this.saveWarnings.delete(answerId);
        }
      }
    } catch (error: unknown) {
      this.saveErrors.set(
        answerId,
        error instanceof Error ? error.message : "保存回答时发生未知错误。",
      );
    } finally {
      if (this.savingAnswerId === answerId) {
        this.savingAnswerId = null;
      }
      this.render();
    }
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
      retryNavigation: () => {
        void this.session.retryNavigation();
      },
      toggleHistory: () => {
        this.isHistoryOpen = !this.isHistoryOpen;
        if (this.isHistoryOpen) {
          this.isDailyHotListOpen = false;
        }
        this.render();
      },
      closeHistory: () => {
        this.isHistoryOpen = false;
        this.render();
      },
      openHistoryEntry: (questionId: string) => {
        this.isHistoryOpen = false;
        void this.openTarget({ type: "question", questionId });
      },
      removeHistoryEntry: (questionId: string) => {
        this.actions.removeHistory(questionId);
      },
      clearHistory: () => {
        this.actions.clearHistory();
      },
      toggleDailyHotList: () => {
        this.isDailyHotListOpen = !this.isDailyHotListOpen;
        if (this.isDailyHotListOpen) {
          this.isHistoryOpen = false;
          void this.dailyHotList.load();
        }
        this.render();
      },
      closeDailyHotList: () => {
        this.isDailyHotListOpen = false;
        this.render();
      },
      refreshDailyHotList: () => {
        void this.dailyHotList.load(true);
      },
      openDailyHotItem: (questionId: string) => {
        this.isDailyHotListOpen = false;
        void this.openTarget({ type: "question", questionId });
      },
      showAuthorAnswers: (author) => {
        void this.authorAnswerList.showAuthor(author);
      },
      loadMoreAuthorAnswers: () => {
        void this.authorAnswerList.loadMore();
      },
      retryAuthorAnswers: () => {
        void this.authorAnswerList.retry();
      },
      openAuthorAnswer: (answer) => {
        void this.openTarget({
          type: "answer",
          answerId: answer.answerId,
          questionId: answer.questionId,
        });
      },
      openComments: (answerId: string) => {
        this.isCommentsOpen = true;
        this.isHistoryOpen = false;
        this.isDailyHotListOpen = false;
        void this.answerCommentList.showAnswer(answerId);
        this.render();
      },
      closeComments: () => {
        this.isCommentsOpen = false;
        this.render();
      },
      changeCommentOrder: (order: CommentOrder) => {
        void this.answerCommentList.changeOrder(order);
      },
      loadMoreComments: () => {
        void this.answerCommentList.loadMore();
      },
      retryComments: () => {
        void this.answerCommentList.retry();
      },
      toggleCommentReplies: (comment: ZhihuComment) => {
        void this.answerCommentList.toggleReplies(comment);
      },
      loadMoreCommentReplies: (commentId: string) => {
        void this.answerCommentList.loadMoreReplies(commentId);
      },
      retryCommentReplies: (commentId: string) => {
        void this.answerCommentList.retryReplies(commentId);
      },
      saveCurrentAnswer: () => {
        void this.saveCurrentAnswer();
      },
      openNote: (path: string) => this.actions.openNote(path),
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
          historyEntries={this.historyEntries}
          isHistoryOpen={this.isHistoryOpen}
          dailyHotList={this.dailyHotListSnapshot}
          authorAnswerList={this.authorAnswerListSnapshot}
          answerCommentList={this.answerCommentListSnapshot}
          isCommentsOpen={this.isCommentsOpen}
          isDailyHotListOpen={this.isDailyHotListOpen}
          saveState={this.currentSaveState()}
          actions={this.readerActions()}
        />
      </StrictMode>,
    );
  }

  private currentSaveState(): AnswerSaveState {
    const answerId = this.snapshot.answers[this.snapshot.currentIndex]?.id;
    if (answerId === undefined) {
      return { status: "idle" };
    }
    if (this.savingAnswerId === answerId) {
      return { status: "saving" };
    }
    const path = this.savedPaths.get(answerId);
    if (path !== undefined) {
      return {
        status: "saved",
        path,
        warnings: this.saveWarnings.get(answerId) ?? [],
      };
    }
    const error = this.saveErrors.get(answerId);
    return error === undefined
      ? { status: "idle" }
      : { status: "error", message: error };
  }
}
