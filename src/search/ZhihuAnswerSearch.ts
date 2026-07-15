import type {
  SearchAnswerResult,
} from "@/domain/zhihu";
import {
  ZhihuGatewayError,
  type ZhihuGateway,
} from "@/zhihu/gateway";

export type ZhihuAnswerSearchPhase = "idle" | "loading" | "ready" | "error";
export type ZhihuAnswerSearchErrorKind = "authentication" | "request";

export interface ZhihuAnswerSearchSnapshot {
  readonly phase: ZhihuAnswerSearchPhase;
  readonly query: string;
  readonly results: readonly SearchAnswerResult[];
  readonly isLoadingMore: boolean;
  readonly isEnd: boolean;
  readonly errorMessage: string | null;
  readonly errorKind: ZhihuAnswerSearchErrorKind | null;
}

export type ZhihuAnswerSearchListener = (
  snapshot: ZhihuAnswerSearchSnapshot,
) => void;

const PAGE_SIZE = 20;

export class ZhihuAnswerSearch {
  private state: ZhihuAnswerSearchSnapshot = emptySnapshot();
  private readonly listeners = new Set<ZhihuAnswerSearchListener>();
  private nextPageUrl: string | null = null;
  private request: Promise<void> | null = null;
  private generation = 0;

  constructor(private readonly gateway: ZhihuGateway) {}

  snapshot(): ZhihuAnswerSearchSnapshot {
    return { ...this.state, results: [...this.state.results] };
  }

  subscribe(listener: ZhihuAnswerSearchListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  search(query: string): Promise<void> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) {
      return Promise.resolve();
    }
    if (normalizedQuery === this.state.query) {
      return this.request ?? Promise.resolve();
    }
    return this.loadFirstPage(normalizedQuery);
  }

  loadMore(): Promise<void> {
    if (
      this.request !== null ||
      this.state.phase !== "ready" ||
      this.state.isEnd ||
      this.nextPageUrl === null
    ) {
      return this.request ?? Promise.resolve();
    }
    const generation = this.generation;
    const query = this.state.query;
    const pageUrl = this.nextPageUrl;
    this.state = {
      ...this.state,
      isLoadingMore: true,
      errorMessage: null,
      errorKind: null,
    };
    this.emit();
    return this.requestPage(query, generation, pageUrl);
  }

  retry(): Promise<void> {
    if (this.request !== null || this.state.query.length === 0) {
      return this.request ?? Promise.resolve();
    }
    return this.state.results.length > 0
      ? this.loadMore()
      : this.loadFirstPage(this.state.query);
  }

  dispose(): void {
    this.generation += 1;
    this.request = null;
    this.listeners.clear();
  }

  private loadFirstPage(query: string): Promise<void> {
    const generation = ++this.generation;
    this.nextPageUrl = null;
    this.request = null;
    this.state = {
      phase: "loading",
      query,
      results: [],
      isLoadingMore: false,
      isEnd: false,
      errorMessage: null,
      errorKind: null,
    };
    this.emit();
    return this.requestPage(query, generation, null);
  }

  private requestPage(
    query: string,
    generation: number,
    pageUrl: string | null,
  ): Promise<void> {
    const request = this.gateway
      .getSearchAnswerPage(query, {
        limit: PAGE_SIZE,
        ...(pageUrl === null ? {} : { pageUrl }),
      })
      .then((page) => {
        if (generation !== this.generation) {
          return;
        }
        this.nextPageUrl = page.nextPageUrl;
        this.state = {
          ...this.state,
          phase: "ready",
          results: mergeResults(this.state.results, page.results),
          isLoadingMore: false,
          isEnd: page.isEnd || page.nextPageUrl === null,
          errorMessage: null,
          errorKind: null,
        };
        this.emit();
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) {
          return;
        }
        this.state = {
          ...this.state,
          phase: this.state.results.length === 0 ? "error" : "ready",
          isLoadingMore: false,
          errorMessage: readableError(error),
          errorKind: classifyError(error),
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

function emptySnapshot(): ZhihuAnswerSearchSnapshot {
  return {
    phase: "idle",
    query: "",
    results: [],
    isLoadingMore: false,
    isEnd: false,
    errorMessage: null,
    errorKind: null,
  };
}

function mergeResults(
  current: readonly SearchAnswerResult[],
  incoming: readonly SearchAnswerResult[],
): readonly SearchAnswerResult[] {
  const seen = new Set(current.map(({ answerId }) => answerId));
  return [
    ...current,
    ...incoming.filter(({ answerId }) => {
      if (seen.has(answerId)) {
        return false;
      }
      seen.add(answerId);
      return true;
    }),
  ];
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "搜索知乎回答时发生未知错误。";
}

function classifyError(error: unknown): ZhihuAnswerSearchErrorKind {
  return error instanceof ZhihuGatewayError &&
      (error.kind === "forbidden" ||
        (error.kind === "response" && error.message.includes("400")))
    ? "authentication"
    : "request";
}
