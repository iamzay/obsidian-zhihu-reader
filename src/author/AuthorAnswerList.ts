import type {
  AuthorAnswerSummary,
  ZhihuAuthor,
} from "@/domain/zhihu";
import type { ZhihuGateway } from "@/zhihu/gateway";

export type AuthorAnswerListPhase = "idle" | "loading" | "ready" | "error";

export interface AuthorAnswerListSnapshot {
  readonly phase: AuthorAnswerListPhase;
  readonly authorIdentifier: string | null;
  readonly authorName: string | null;
  readonly answers: readonly AuthorAnswerSummary[];
  readonly isLoadingMore: boolean;
  readonly isEnd: boolean;
  readonly errorMessage: string | null;
}

export type AuthorAnswerListListener = (
  snapshot: AuthorAnswerListSnapshot,
) => void;

const PAGE_SIZE = 10;

export class AuthorAnswerList {
  private state: AuthorAnswerListSnapshot = emptySnapshot();
  private readonly listeners = new Set<AuthorAnswerListListener>();
  private nextPageUrl: string | null = null;
  private request: Promise<void> | null = null;
  private generation = 0;

  constructor(private readonly gateway: ZhihuGateway) {}

  snapshot(): AuthorAnswerListSnapshot {
    return { ...this.state, answers: [...this.state.answers] };
  }

  subscribe(listener: AuthorAnswerListListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  showAuthor(author: ZhihuAuthor): Promise<void> {
    const identifier = author.urlToken ?? author.id;
    if (identifier === undefined) {
      return Promise.resolve();
    }
    if (identifier === this.state.authorIdentifier) {
      return this.request ?? Promise.resolve();
    }
    return this.loadFirstPage(identifier, author.name);
  }

  loadMore(): Promise<void> {
    if (
      this.request !== null ||
      this.state.phase !== "ready" ||
      this.state.isEnd ||
      this.nextPageUrl === null ||
      this.state.authorIdentifier === null
    ) {
      return this.request ?? Promise.resolve();
    }
    const generation = this.generation;
    const identifier = this.state.authorIdentifier;
    const pageUrl = this.nextPageUrl;
    this.state = {
      ...this.state,
      isLoadingMore: true,
      errorMessage: null,
    };
    this.emit();
    return this.requestPage(identifier, generation, pageUrl);
  }

  retry(): Promise<void> {
    if (
      this.request !== null ||
      this.state.authorIdentifier === null ||
      this.state.authorName === null
    ) {
      return this.request ?? Promise.resolve();
    }
    if (this.state.answers.length > 0) {
      return this.loadMore();
    }
    return this.loadFirstPage(
      this.state.authorIdentifier,
      this.state.authorName,
    );
  }

  dispose(): void {
    this.generation += 1;
    this.request = null;
    this.listeners.clear();
  }

  private loadFirstPage(identifier: string, name: string): Promise<void> {
    const generation = ++this.generation;
    this.nextPageUrl = null;
    this.request = null;
    this.state = {
      phase: "loading",
      authorIdentifier: identifier,
      authorName: name,
      answers: [],
      isLoadingMore: false,
      isEnd: false,
      errorMessage: null,
    };
    this.emit();
    return this.requestPage(identifier, generation, null);
  }

  private requestPage(
    identifier: string,
    generation: number,
    pageUrl: string | null,
  ): Promise<void> {
    const request = this.gateway
      .getAuthorAnswerPage(identifier, {
        limit: PAGE_SIZE,
        ...(pageUrl === null ? {} : { pageUrl }),
      })
      .then((page) => {
        if (generation !== this.generation) {
          return;
        }
        const seen = new Set(this.state.answers.map(({ answerId }) => answerId));
        const unique = page.answers.filter(({ answerId }) => {
          if (seen.has(answerId)) {
            return false;
          }
          seen.add(answerId);
          return true;
        });
        this.nextPageUrl = page.nextPageUrl;
        this.state = {
          ...this.state,
          phase: "ready",
          answers: [...this.state.answers, ...unique],
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
          phase: this.state.answers.length === 0 ? "error" : "ready",
          isLoadingMore: false,
          errorMessage: readableError(error),
        };
        this.emit();
      })
      .finally(() => {
        if (this.request === request) {
          this.request = null;
        }
      });
    this.request = request;
    return request;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function emptySnapshot(): AuthorAnswerListSnapshot {
  return {
    phase: "idle",
    authorIdentifier: null,
    authorName: null,
    answers: [],
    isLoadingMore: false,
    isEnd: false,
    errorMessage: null,
  };
}

function readableError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "加载用户回答时发生未知错误。";
}
