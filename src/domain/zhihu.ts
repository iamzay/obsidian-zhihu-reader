export type ZhihuTarget =
  | { readonly type: "question"; readonly questionId: string }
  | {
      readonly type: "answer";
      readonly answerId: string;
      readonly questionId?: string;
    };

export interface QuestionTopic {
  readonly id: string;
  readonly name: string;
}

export interface QuestionReference {
  readonly id: string;
  readonly title: string;
  readonly url: string;
}

export interface QuestionSummary extends QuestionReference {
  readonly detailHtml: string;
  readonly excerpt: string;
  readonly topics: readonly QuestionTopic[];
  readonly answerCount: number;
  readonly followerCount: number;
}

export interface ZhihuAuthor {
  readonly id?: string;
  readonly name: string;
  readonly headline: string;
  readonly avatarUrl?: string;
  readonly profileUrl?: string;
}

export interface AnswerDocument {
  readonly id: string;
  readonly url: string;
  readonly author: ZhihuAuthor;
  readonly contentHtml: string;
  readonly excerpt: string;
  readonly voteupCount: number;
  readonly commentCount: number;
  readonly createdTime?: number;
  readonly updatedTime?: number;
  readonly question: QuestionReference;
}

export interface AnswerPage {
  readonly answers: readonly AnswerDocument[];
  readonly isEnd: boolean;
  readonly nextPageUrl: string | null;
  readonly previousPageUrl: string | null;
}

export type ReaderPhase = "idle" | "loading" | "ready" | "error";

/** Read-only state exposed by ReaderSession to the React view. */
export interface ReaderSnapshot {
  readonly phase: ReaderPhase;
  readonly target: ZhihuTarget | null;
  readonly question: QuestionSummary | null;
  readonly answers: readonly AnswerDocument[];
  readonly currentIndex: number;
  readonly anchorAnswerId: string | null;
  readonly isLoadingNextPage: boolean;
  readonly isEnd: boolean;
  readonly errorMessage: string | null;
}
