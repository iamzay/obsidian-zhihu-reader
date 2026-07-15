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
  readonly urlToken?: string;
  readonly name: string;
  readonly headline: string;
  readonly avatarUrl?: string;
  readonly profileUrl?: string;
}

export interface AuthorAnswerSummary {
  readonly answerId: string;
  readonly questionId: string;
  readonly questionTitle: string;
  readonly excerpt: string;
  readonly voteupCount: number;
  readonly createdTime?: number;
}

export interface AuthorAnswerPage {
  readonly answers: readonly AuthorAnswerSummary[];
  readonly isEnd: boolean;
  readonly nextPageUrl: string | null;
}

export interface SearchAnswerResult {
  readonly answerId: string;
  readonly questionId: string;
  readonly questionTitle: string;
  readonly excerpt: string;
  readonly author: ZhihuAuthor;
  readonly voteupCount: number;
  readonly commentCount: number;
}

export interface SearchAnswerPage {
  readonly results: readonly SearchAnswerResult[];
  readonly isEnd: boolean;
  readonly nextPageUrl: string | null;
}

export interface AnswerDocument {
  readonly id: string;
  readonly url: string;
  readonly author: ZhihuAuthor;
  readonly contentHtml: string;
  readonly excerpt: string;
  readonly voteupCount: number;
  readonly isVoted: boolean;
  readonly commentCount: number;
  readonly createdTime?: number;
  readonly updatedTime?: number;
  readonly question: QuestionSummary;
}

export interface AnswerVoteResult {
  readonly isVoted: boolean;
  readonly voteupCount: number;
}

export interface AnswerPage {
  readonly answers: readonly AnswerDocument[];
  readonly isEnd: boolean;
  readonly nextPageUrl: string | null;
  readonly previousPageUrl: string | null;
}

export type CommentOrder = "score" | "time";

export interface ZhihuComment {
  readonly id: string;
  readonly author: ZhihuAuthor;
  readonly replyToAuthor?: ZhihuAuthor;
  readonly contentHtml: string;
  readonly createdTime?: number;
  readonly likeCount: number;
  readonly childCommentCount: number;
  readonly childComments: readonly ZhihuComment[];
  readonly isAnswerAuthor: boolean;
  readonly isTop: boolean;
}

export interface CommentPage {
  readonly comments: readonly ZhihuComment[];
  readonly isEnd: boolean;
  readonly nextPageUrl: string | null;
}

export interface ZhihuHotListItem {
  readonly rank: number;
  readonly questionId: string;
  readonly title: string;
  readonly excerpt: string;
  readonly heatLabel: string;
  readonly answerCount: number;
  readonly followerCount: number;
  readonly thumbnailUrl?: string;
}

export type ReaderPhase = "idle" | "loading" | "ready" | "error";
export type AnswerOrder = "default" | "updated";

/** Read-only state exposed by ReaderSession to the React view. */
export interface ReaderSnapshot {
  readonly phase: ReaderPhase;
  readonly target: ZhihuTarget | null;
  readonly question: QuestionSummary | null;
  readonly answers: readonly AnswerDocument[];
  readonly currentIndex: number;
  readonly initialAnswerId: string | null;
  readonly isLoadingNextPage: boolean;
  readonly isEnd: boolean;
  readonly errorMessage: string | null;
  readonly navigationError: string | null;
  readonly order: AnswerOrder;
}
