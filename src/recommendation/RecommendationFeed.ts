import type {
  ZhihuRecommendationItem,
} from "@/domain/zhihu";
import {
  ZhihuGatewayError,
  type ZhihuGateway,
} from "@/zhihu/gateway";

export type RecommendationFeedPhase = "idle" | "loading" | "ready" | "error";
export type RecommendationFeedErrorKind = "authentication" | "request";

export interface RecommendationFeedSnapshot {
  readonly phase: RecommendationFeedPhase;
  readonly items: readonly ZhihuRecommendationItem[];
  readonly isLoadingMore: boolean;
  readonly isEnd: boolean;
  readonly errorMessage: string | null;
  readonly errorKind: RecommendationFeedErrorKind | null;
}

export type RecommendationFeedListener = (
  snapshot: RecommendationFeedSnapshot,
) => void;

const PAGE_SIZE = 10;

export class RecommendationFeed {
  private state: RecommendationFeedSnapshot = emptySnapshot();
  private readonly listeners = new Set<RecommendationFeedListener>();
  private nextPageUrl: string | null = null;
  private request: Promise<void> | null = null;
  private retryMode: "first" | "more" | null = null;
  private generation = 0;

  constructor(private readonly gateway: ZhihuGateway) {}

  snapshot(): RecommendationFeedSnapshot {
    return { ...this.state, items: [...this.state.items] };
  }

  subscribe(listener: RecommendationFeedListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  load(force = false): Promise<void> {
    if (this.request !== null) {
      return this.request;
    }
    if (!force && this.state.phase === "ready") {
      return Promise.resolve();
    }

    const generation = ++this.generation;
    this.retryMode = "first";
    this.state = {
      ...this.state,
      phase: "loading",
      isLoadingMore: false,
      isEnd: false,
      errorMessage: null,
      errorKind: null,
    };
    this.emit();
    return this.requestPage(generation, null, true);
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

    this.state = {
      ...this.state,
      isLoadingMore: true,
      errorMessage: null,
      errorKind: null,
    };
    this.retryMode = "more";
    this.emit();
    return this.requestPage(this.generation, this.nextPageUrl, false);
  }

  retry(): Promise<void> {
    if (this.request !== null) {
      return this.request;
    }
    return this.retryMode === "more" ? this.loadMore() : this.load(true);
  }

  dispose(): void {
    this.generation += 1;
    this.request = null;
    this.retryMode = null;
    this.listeners.clear();
  }

  private requestPage(
    generation: number,
    pageUrl: string | null,
    replace: boolean,
  ): Promise<void> {
    const request = this.gateway
      .getRecommendationPage({
        limit: PAGE_SIZE,
        ...(pageUrl === null ? {} : { pageUrl }),
      })
      .then((page) => {
        if (generation !== this.generation) {
          return;
        }
        this.nextPageUrl = page.nextPageUrl;
        this.retryMode = null;
        this.state = {
          phase: "ready",
          items: replace
            ? [...page.items]
            : mergeItems(this.state.items, page.items),
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
          phase: this.state.items.length === 0 ? "error" : "ready",
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

function emptySnapshot(): RecommendationFeedSnapshot {
  return {
    phase: "idle",
    items: [],
    isLoadingMore: false,
    isEnd: false,
    errorMessage: null,
    errorKind: null,
  };
}

function mergeItems(
  current: readonly ZhihuRecommendationItem[],
  incoming: readonly ZhihuRecommendationItem[],
): readonly ZhihuRecommendationItem[] {
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
  return error instanceof Error ? error.message : "加载知乎推荐时发生未知错误。";
}

function classifyError(error: unknown): RecommendationFeedErrorKind {
  return error instanceof ZhihuGatewayError && error.kind === "forbidden"
    ? "authentication"
    : "request";
}
