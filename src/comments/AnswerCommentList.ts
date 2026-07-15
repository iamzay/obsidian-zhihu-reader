import type {
  CommentOrder,
  ZhihuComment,
} from "@/domain/zhihu";
import type { ZhihuGateway } from "@/zhihu/gateway";

export type AnswerCommentListPhase = "idle" | "loading" | "ready" | "error";

export interface CommentRepliesSnapshot {
  readonly phase: AnswerCommentListPhase;
  readonly isExpanded: boolean;
  readonly comments: readonly ZhihuComment[];
  readonly isLoadingMore: boolean;
  readonly isEnd: boolean;
  readonly errorMessage: string | null;
}

export interface AnswerCommentListSnapshot {
  readonly phase: AnswerCommentListPhase;
  readonly answerId: string | null;
  readonly order: CommentOrder;
  readonly comments: readonly ZhihuComment[];
  readonly replies: Readonly<Record<string, CommentRepliesSnapshot>>;
  readonly isLoadingMore: boolean;
  readonly isEnd: boolean;
  readonly errorMessage: string | null;
}

export type AnswerCommentListListener = (
  snapshot: AnswerCommentListSnapshot,
) => void;

const PAGE_SIZE = 10;

export class AnswerCommentList {
  private state: AnswerCommentListSnapshot = emptySnapshot();
  private readonly listeners = new Set<AnswerCommentListListener>();
  private rootNextPageUrl: string | null = null;
  private readonly replyNextPageUrls = new Map<string, string | null>();
  private rootRequest: Promise<void> | null = null;
  private readonly replyRequests = new Map<string, Promise<void>>();
  private generation = 0;

  constructor(private readonly gateway: ZhihuGateway) {}

  snapshot(): AnswerCommentListSnapshot {
    return {
      ...this.state,
      comments: [...this.state.comments],
      replies: Object.fromEntries(
        Object.entries(this.state.replies).map(([id, replies]) => [
          id,
          { ...replies, comments: [...replies.comments] },
        ]),
      ),
    };
  }

  subscribe(listener: AnswerCommentListListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  showAnswer(answerId: string): Promise<void> {
    if (answerId === this.state.answerId) {
      return this.rootRequest ?? Promise.resolve();
    }
    return this.loadFirstPage(answerId, this.state.order);
  }

  changeOrder(order: CommentOrder): Promise<void> {
    if (order === this.state.order || this.state.answerId === null) {
      return this.rootRequest ?? Promise.resolve();
    }
    return this.loadFirstPage(this.state.answerId, order);
  }

  loadMore(): Promise<void> {
    if (
      this.rootRequest !== null ||
      this.state.phase !== "ready" ||
      this.state.answerId === null ||
      this.state.isEnd ||
      this.rootNextPageUrl === null
    ) {
      return this.rootRequest ?? Promise.resolve();
    }
    const generation = this.generation;
    const answerId = this.state.answerId;
    const nextPageUrl = this.rootNextPageUrl;
    this.state = {
      ...this.state,
      isLoadingMore: true,
      errorMessage: null,
    };
    this.emit();
    return this.requestRootPage(
      answerId,
      this.state.order,
      generation,
      nextPageUrl,
    );
  }

  retry(): Promise<void> {
    if (this.state.answerId === null || this.rootRequest !== null) {
      return this.rootRequest ?? Promise.resolve();
    }
    return this.state.comments.length > 0
      ? this.loadMore()
      : this.loadFirstPage(this.state.answerId, this.state.order);
  }

  toggleReplies(comment: ZhihuComment): Promise<void> {
    const current = this.state.replies[comment.id];
    if (current !== undefined) {
      this.updateReplies(comment.id, {
        ...current,
        isExpanded: !current.isExpanded,
      });
      return this.replyRequests.get(comment.id) ?? Promise.resolve();
    }
    if (comment.childCommentCount === 0) {
      return Promise.resolve();
    }
    if (comment.childComments.length >= comment.childCommentCount) {
      this.updateReplies(comment.id, {
        phase: "ready",
        isExpanded: true,
        comments: [...comment.childComments],
        isLoadingMore: false,
        isEnd: true,
        errorMessage: null,
      });
      return Promise.resolve();
    }

    this.updateReplies(comment.id, {
      phase: "loading",
      isExpanded: true,
      comments: [...comment.childComments],
      isLoadingMore: false,
      isEnd: false,
      errorMessage: null,
    });
    return this.requestReplyPage(comment.id, this.generation, null);
  }

  loadMoreReplies(commentId: string): Promise<void> {
    const current = this.state.replies[commentId];
    const existingRequest = this.replyRequests.get(commentId);
    const nextPageUrl = this.replyNextPageUrls.get(commentId) ?? null;
    if (
      current === undefined ||
      current.phase !== "ready" ||
      current.isEnd ||
      nextPageUrl === null ||
      existingRequest !== undefined
    ) {
      return existingRequest ?? Promise.resolve();
    }
    this.updateReplies(commentId, {
      ...current,
      isLoadingMore: true,
      errorMessage: null,
    });
    return this.requestReplyPage(commentId, this.generation, nextPageUrl);
  }

  retryReplies(commentId: string): Promise<void> {
    const current = this.state.replies[commentId];
    const existingRequest = this.replyRequests.get(commentId);
    if (current === undefined || existingRequest !== undefined) {
      return existingRequest ?? Promise.resolve();
    }
    if (this.replyNextPageUrls.has(commentId)) {
      return this.loadMoreReplies(commentId);
    }
    this.updateReplies(commentId, {
      ...current,
      phase: "loading",
      errorMessage: null,
    });
    return this.requestReplyPage(commentId, this.generation, null);
  }

  dispose(): void {
    this.generation += 1;
    this.rootRequest = null;
    this.replyRequests.clear();
    this.listeners.clear();
  }

  private loadFirstPage(
    answerId: string,
    order: CommentOrder,
  ): Promise<void> {
    const generation = ++this.generation;
    this.rootNextPageUrl = null;
    this.replyNextPageUrls.clear();
    this.replyRequests.clear();
    this.rootRequest = null;
    this.state = {
      phase: "loading",
      answerId,
      order,
      comments: [],
      replies: {},
      isLoadingMore: false,
      isEnd: false,
      errorMessage: null,
    };
    this.emit();
    return this.requestRootPage(answerId, order, generation, null);
  }

  private requestRootPage(
    answerId: string,
    order: CommentOrder,
    generation: number,
    pageUrl: string | null,
  ): Promise<void> {
    const request = this.gateway
      .getAnswerCommentPage(answerId, {
        limit: PAGE_SIZE,
        order,
        ...(pageUrl === null ? {} : { pageUrl }),
      })
      .then((page) => {
        if (generation !== this.generation) {
          return;
        }
        this.rootNextPageUrl = page.nextPageUrl;
        this.state = {
          ...this.state,
          phase: "ready",
          comments: mergeComments(this.state.comments, page.comments),
          isLoadingMore: false,
          isEnd: page.isEnd || page.nextPageUrl === null,
          errorMessage: null,
        };
        this.emit();
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) {
          return;
        }
        this.state = {
          ...this.state,
          phase: this.state.comments.length === 0 ? "error" : "ready",
          isLoadingMore: false,
          errorMessage: readableError(error),
        };
        this.emit();
      })
      .finally(() => {
        if (this.rootRequest === request) {
          this.rootRequest = null;
        }
      });
    this.rootRequest = request;
    return request;
  }

  private requestReplyPage(
    commentId: string,
    generation: number,
    pageUrl: string | null,
  ): Promise<void> {
    const request = this.gateway
      .getChildCommentPage(commentId, {
        limit: PAGE_SIZE,
        ...(pageUrl === null ? {} : { pageUrl }),
      })
      .then((page) => {
        if (generation !== this.generation) {
          return;
        }
        const current = this.state.replies[commentId];
        if (current === undefined) {
          return;
        }
        this.replyNextPageUrls.set(commentId, page.nextPageUrl);
        this.updateReplies(commentId, {
          ...current,
          phase: "ready",
          comments: mergeComments(current.comments, page.comments),
          isLoadingMore: false,
          isEnd: page.isEnd || page.nextPageUrl === null,
          errorMessage: null,
        });
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) {
          return;
        }
        const current = this.state.replies[commentId];
        if (current === undefined) {
          return;
        }
        this.updateReplies(commentId, {
          ...current,
          phase: current.comments.length === 0 ? "error" : "ready",
          isLoadingMore: false,
          errorMessage: readableError(error),
        });
      })
      .finally(() => {
        if (this.replyRequests.get(commentId) === request) {
          this.replyRequests.delete(commentId);
        }
      });
    this.replyRequests.set(commentId, request);
    return request;
  }

  private updateReplies(
    commentId: string,
    replies: CommentRepliesSnapshot,
  ): void {
    this.state = {
      ...this.state,
      replies: { ...this.state.replies, [commentId]: replies },
    };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function emptySnapshot(): AnswerCommentListSnapshot {
  return {
    phase: "idle",
    answerId: null,
    order: "score",
    comments: [],
    replies: {},
    isLoadingMore: false,
    isEnd: false,
    errorMessage: null,
  };
}

function mergeComments(
  current: readonly ZhihuComment[],
  incoming: readonly ZhihuComment[],
): readonly ZhihuComment[] {
  const seen = new Set(current.map(({ id }) => id));
  return [
    ...current,
    ...incoming.filter(({ id }) => {
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    }),
  ];
}

function readableError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "加载回答评论时发生未知错误。";
}
