import type { AnswerDocument } from "@/domain/zhihu";
import type { ZhihuGateway } from "@/zhihu/gateway";

export interface AnswerVoteState {
  readonly isVoted: boolean;
  readonly voteupCount: number;
  readonly isSubmitting: boolean;
  readonly errorMessage: string | null;
}

type Listener = () => void;

export class AnswerVoteController {
  private readonly states = new Map<string, AnswerVoteState>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Set<Listener>();
  private disposed = false;

  constructor(private readonly gateway: Pick<ZhihuGateway, "setAnswerVote">) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(answer: AnswerDocument): AnswerVoteState {
    return this.states.get(answer.id) ?? initialState(answer);
  }

  toggle(answer: AnswerDocument): Promise<void> {
    const existing = this.pending.get(answer.id);
    if (existing !== undefined) {
      return existing;
    }

    const previous = this.snapshot(answer);
    const isVoted = !previous.isVoted;
    this.states.set(answer.id, {
      isVoted,
      voteupCount: Math.max(
        0,
        previous.voteupCount + (isVoted ? 1 : -1),
      ),
      isSubmitting: true,
      errorMessage: null,
    });
    this.emit();

    const request = Promise.resolve()
      .then(() => this.gateway.setAnswerVote(answer.id, isVoted))
      .then((result) => {
        if (this.disposed) {
          return;
        }
        this.states.set(answer.id, {
          isVoted: result.isVoted,
          voteupCount: result.voteupCount,
          isSubmitting: false,
          errorMessage: null,
        });
      })
      .catch((error: unknown) => {
        if (this.disposed) {
          return;
        }
        this.states.set(answer.id, {
          ...previous,
          isSubmitting: false,
          errorMessage:
            error instanceof Error ? error.message : "点赞回答时发生未知错误。",
        });
      })
      .finally(() => {
        this.pending.delete(answer.id);
        if (!this.disposed) {
          this.emit();
        }
      });
    this.pending.set(answer.id, request);
    return request;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.states.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function initialState(answer: AnswerDocument): AnswerVoteState {
  return {
    isVoted: answer.isVoted,
    voteupCount: answer.voteupCount,
    isSubmitting: false,
    errorMessage: null,
  };
}
