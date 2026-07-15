import type { ZhihuHotListItem } from "@/domain/zhihu";
import {
  ZhihuGatewayError,
  type ZhihuGateway,
} from "@/zhihu/gateway";

export type DailyHotListPhase = "idle" | "loading" | "ready" | "error";
export type DailyHotListErrorKind = "authentication" | "request";

export interface DailyHotListSnapshot {
  readonly phase: DailyHotListPhase;
  readonly items: readonly ZhihuHotListItem[];
  readonly loadedAt: string | null;
  readonly errorMessage: string | null;
  readonly errorKind: DailyHotListErrorKind | null;
}

export type DailyHotListListener = (snapshot: DailyHotListSnapshot) => void;

const DEFAULT_CACHE_DURATION_MS = 5 * 60 * 1000;

export class DailyHotList {
  private state: DailyHotListSnapshot = {
    phase: "idle",
    items: [],
    loadedAt: null,
    errorMessage: null,
    errorKind: null,
  };
  private readonly listeners = new Set<DailyHotListListener>();
  private request: Promise<void> | null = null;
  private generation = 0;

  constructor(
    private readonly gateway: ZhihuGateway,
    private readonly now: () => Date = () => new Date(),
    private readonly cacheDurationMs = DEFAULT_CACHE_DURATION_MS,
  ) {}

  snapshot(): DailyHotListSnapshot {
    return { ...this.state, items: [...this.state.items] };
  }

  subscribe(listener: DailyHotListListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  load(force = false): Promise<void> {
    if (this.request !== null) {
      return this.request;
    }
    if (!force && this.isFresh()) {
      return Promise.resolve();
    }

    const generation = ++this.generation;
    this.state = {
      ...this.state,
      phase: "loading",
      errorMessage: null,
      errorKind: null,
    };
    this.emit();
    const request = this.gateway
      .getHotList(50)
      .then((items) => {
        if (generation !== this.generation) {
          return;
        }
        this.state = {
          phase: "ready",
          items: [...items],
          loadedAt: this.now().toISOString(),
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
          phase: "error",
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

  dispose(): void {
    this.generation += 1;
    this.request = null;
    this.listeners.clear();
  }

  private isFresh(): boolean {
    if (this.state.phase !== "ready" || this.state.loadedAt === null) {
      return false;
    }
    return this.now().getTime() - new Date(this.state.loadedAt).getTime() <
      this.cacheDurationMs;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "加载每日热榜时发生未知错误。";
}

function classifyError(error: unknown): DailyHotListErrorKind {
  return error instanceof ZhihuGatewayError && error.kind === "forbidden"
    ? "authentication"
    : "request";
}
