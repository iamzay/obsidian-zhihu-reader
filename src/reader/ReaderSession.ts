import type {
  AnswerDocument,
  AnswerOrder,
  ReaderSnapshot,
  ZhihuTarget,
} from "@/domain/zhihu";
import type { ZhihuGateway } from "@/zhihu/gateway";

export interface ReaderSessionOptions {
  readonly feedLimit: number;
  readonly order: AnswerOrder;
}

export type ReaderSessionOptionsProvider = () => ReaderSessionOptions;
export type ReaderSessionListener = (snapshot: ReaderSnapshot) => void;

export class ReaderSession {
  private readonly listeners = new Set<ReaderSessionListener>();
  private state: ReaderSnapshot;
  private generation = 0;
  private seenAnswerIds = new Set<string>();
  private nextPageUrl: string | null = null;
  private hasLoadedFirstPage = false;
  private pageRequest: Promise<void> | null = null;
  private nextOperation: Promise<void> | null = null;
  private pendingJumpAnswerNumber: number | null = null;

  constructor(
    private readonly gateway: ZhihuGateway,
    private readonly optionsProvider: ReaderSessionOptionsProvider,
  ) {
    this.state = emptySnapshot(optionsProvider().order);
  }

  subscribe(listener: ReaderSessionListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): ReaderSnapshot {
    return { ...this.state, answers: [...this.state.answers] };
  }

  async open(target: ZhihuTarget): Promise<void> {
    const generation = ++this.generation;
    const options = this.optionsProvider();
    this.reset(target, options.order);
    this.state = { ...this.state, phase: "loading" };
    this.emit();

    if (target.type === "question") {
      await this.openQuestion(target.questionId, options, generation);
    } else {
      await this.openAnswer(target.answerId, options, generation);
    }
  }

  previous(): void {
    if (this.state.phase !== "ready" || this.state.currentIndex <= 0) {
      return;
    }
    this.state = {
      ...this.state,
      currentIndex: this.state.currentIndex - 1,
      navigationError: null,
    };
    this.pendingJumpAnswerNumber = null;
    this.emit();
  }

  next(): Promise<void> {
    if (this.nextOperation !== null) {
      return this.nextOperation;
    }
    const operation = this.performNext().finally(() => {
      if (this.nextOperation === operation) {
        this.nextOperation = null;
      }
    });
    this.nextOperation = operation;
    return operation;
  }

  jumpTo(answerNumber: number): Promise<void> {
    if (this.nextOperation !== null) {
      const generation = this.generation;
      return this.nextOperation.then(async () => {
        if (this.isCurrent(generation)) {
          await this.jumpTo(answerNumber);
        }
      });
    }
    const operation = this.performJump(answerNumber).finally(() => {
      if (this.nextOperation === operation) {
        this.nextOperation = null;
      }
    });
    this.nextOperation = operation;
    return operation;
  }

  async changeOrder(order: AnswerOrder): Promise<void> {
    if (order === this.state.order || this.state.target === null) {
      return;
    }

    const generation = ++this.generation;
    const target = this.state.target;
    const initialAnswer =
      this.state.initialAnswerId === null
        ? null
        : this.state.answers.find(({ id }) => id === this.state.initialAnswerId) ??
          null;
    this.nextPageUrl = null;
    this.hasLoadedFirstPage = false;
    this.pageRequest = null;
    this.nextOperation = null;
    this.pendingJumpAnswerNumber = null;
    this.seenAnswerIds = new Set(
      initialAnswer === null ? [] : [initialAnswer.id],
    );

    if (target.type === "answer" && initialAnswer !== null) {
      this.state = {
        ...this.state,
        answers: [initialAnswer],
        currentIndex: 0,
        order,
        isEnd: false,
        isLoadingNextPage: true,
        navigationError: null,
      };
      this.emit();
      await this.loadPage(initialAnswer.question.id, generation, false);
      return;
    }
    if (target.type !== "question") {
      return;
    }

    this.state = {
      ...this.state,
      answers: [],
      currentIndex: -1,
      order,
      phase: "loading",
      isEnd: false,
      navigationError: null,
    };
    this.emit();
    await this.loadInitialQuestionPage(target.questionId, generation);
  }

  async retryNavigation(): Promise<void> {
    if (this.pendingJumpAnswerNumber !== null) {
      const answerNumber = this.pendingJumpAnswerNumber;
      await this.jumpTo(answerNumber);
      return;
    }
    if (
      this.state.phase !== "ready" ||
      this.state.question === null ||
      this.state.isLoadingNextPage ||
      this.state.isEnd
    ) {
      return;
    }
    await this.loadPage(this.state.question.id, this.generation, false);
  }

  dispose(): void {
    this.generation += 1;
    this.listeners.clear();
    this.pageRequest = null;
    this.nextOperation = null;
    this.pendingJumpAnswerNumber = null;
  }

  private async openQuestion(
    questionId: string,
    options: ReaderSessionOptions,
    generation: number,
  ): Promise<void> {
    try {
      const [question, page] = await Promise.all([
        this.gateway.getQuestion(questionId),
        this.gateway.getAnswerPage(questionId, {
          limit: options.feedLimit,
          order: options.order,
        }),
      ]);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.hasLoadedFirstPage = true;
      this.nextPageUrl = page.nextPageUrl;
      this.appendAnswers(page.answers);
      this.state = {
        ...this.state,
        phase: "ready",
        question,
        currentIndex: this.state.answers.length === 0 ? -1 : 0,
        isEnd: page.isEnd || page.nextPageUrl === null,
      };
    } catch (error: unknown) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.state = {
        ...this.state,
        phase: "error",
        errorMessage: readableError(error),
      };
    }
    this.emit();
  }

  private async openAnswer(
    answerId: string,
    options: ReaderSessionOptions,
    generation: number,
  ): Promise<void> {
    try {
      const answer = await this.gateway.getAnswer(answerId);
      const question = await this.gateway.getQuestion(answer.question.id);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.seenAnswerIds.add(answer.id);
      this.state = {
        ...this.state,
        phase: "ready",
        question,
        answers: [answer],
        currentIndex: 0,
        initialAnswerId: answer.id,
        isLoadingNextPage: true,
      };
      this.emit();
      await this.loadPage(question.id, generation, false, options);
    } catch (error: unknown) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.state = {
        ...this.state,
        phase: "error",
        errorMessage: readableError(error),
      };
      this.emit();
    }
  }

  private async loadInitialQuestionPage(
    questionId: string,
    generation: number,
  ): Promise<void> {
    try {
      const options = this.optionsProvider();
      const page = await this.gateway.getAnswerPage(questionId, {
        limit: options.feedLimit,
        order: this.state.order,
      });
      if (!this.isCurrent(generation)) {
        return;
      }
      this.hasLoadedFirstPage = true;
      this.nextPageUrl = page.nextPageUrl;
      this.appendAnswers(page.answers);
      this.state = {
        ...this.state,
        phase: "ready",
        currentIndex: this.state.answers.length === 0 ? -1 : 0,
        isEnd: page.isEnd || page.nextPageUrl === null,
      };
    } catch (error: unknown) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.state = {
        ...this.state,
        phase: "error",
        errorMessage: readableError(error),
      };
    }
    this.emit();
  }

  private async performNext(): Promise<void> {
    this.pendingJumpAnswerNumber = null;
    if (this.state.phase !== "ready") {
      return;
    }
    const generation = this.generation;
    if (this.state.currentIndex + 1 < this.state.answers.length) {
      this.moveForward();
      return;
    }

    if (this.pageRequest !== null) {
      await this.pageRequest;
      if (!this.isCurrent(generation)) {
        return;
      }
      if (this.state.currentIndex + 1 < this.state.answers.length) {
        this.moveForward();
      }
      return;
    }

    if (this.state.isEnd || this.state.question === null) {
      return;
    }
    const previousLength = this.state.answers.length;
    await this.loadPage(this.state.question.id, generation, false);
    if (!this.isCurrent(generation)) {
      return;
    }
    if (this.state.answers.length > previousLength) {
      this.state = { ...this.state, currentIndex: previousLength };
      this.emit();
    }
  }

  private async performJump(answerNumber: number): Promise<void> {
    if (this.state.phase !== "ready") {
      return;
    }
    if (!Number.isInteger(answerNumber) || answerNumber < 1) {
      this.pendingJumpAnswerNumber = null;
      this.state = {
        ...this.state,
        navigationError: "回答编号必须是大于 0 的整数。",
      };
      this.emit();
      return;
    }

    this.pendingJumpAnswerNumber = answerNumber;
    const generation = this.generation;
    const targetIndex = answerNumber - 1;
    while (
      targetIndex >= this.state.answers.length &&
      !this.state.isEnd &&
      this.state.question !== null
    ) {
      const previousLength = this.state.answers.length;
      const previousPageUrl = this.nextPageUrl;
      await this.loadPage(this.state.question.id, generation, false);
      if (!this.isCurrent(generation)) {
        return;
      }
      if (this.state.navigationError !== null) {
        return;
      }
      if (
        this.state.answers.length === previousLength &&
        this.nextPageUrl === previousPageUrl &&
        !this.state.isEnd
      ) {
        this.pendingJumpAnswerNumber = null;
        this.state = {
          ...this.state,
          navigationError: "回答列表没有返回更多内容，无法继续跳转。",
        };
        this.emit();
        return;
      }
    }

    this.pendingJumpAnswerNumber = null;
    if (targetIndex < this.state.answers.length) {
      this.state = {
        ...this.state,
        currentIndex: targetIndex,
        navigationError: null,
      };
    } else {
      this.state = {
        ...this.state,
        navigationError: `未找到第 ${answerNumber} 篇回答。`,
      };
    }
    this.emit();
  }

  private loadPage(
    questionId: string,
    generation: number,
    moveAfterLoad: boolean,
    initialOptions?: ReaderSessionOptions,
  ): Promise<void> {
    if (this.pageRequest !== null) {
      return this.pageRequest;
    }
    const previousLength = this.state.answers.length;
    const options = initialOptions ?? this.optionsProvider();
    this.state = {
      ...this.state,
      isLoadingNextPage: true,
      navigationError: null,
    };
    this.emit();

    const request = this.gateway
      .getAnswerPage(questionId, {
        limit: options.feedLimit,
        order: this.state.order,
        ...(this.hasLoadedFirstPage && this.nextPageUrl !== null
          ? { pageUrl: this.nextPageUrl }
          : {}),
      })
      .then((page) => {
        if (!this.isCurrent(generation)) {
          return;
        }
        this.hasLoadedFirstPage = true;
        this.nextPageUrl = page.nextPageUrl;
        this.appendAnswers(page.answers);
        this.state = {
          ...this.state,
          isEnd: page.isEnd || page.nextPageUrl === null,
          isLoadingNextPage: false,
          navigationError: null,
          ...(moveAfterLoad && this.state.answers.length > previousLength
            ? { currentIndex: previousLength }
            : {}),
        };
        this.emit();
      })
      .catch((error: unknown) => {
        if (!this.isCurrent(generation)) {
          return;
        }
        this.state = {
          ...this.state,
          isLoadingNextPage: false,
          navigationError: readableError(error),
        };
        this.emit();
      })
      .finally(() => {
        if (this.pageRequest === request) {
          this.pageRequest = null;
        }
      });
    this.pageRequest = request;
    return request;
  }

  private moveForward(): void {
    this.state = {
      ...this.state,
      currentIndex: this.state.currentIndex + 1,
      navigationError: null,
    };
    this.emit();
  }

  private appendAnswers(answers: readonly AnswerDocument[]): void {
    const unique = answers.filter(({ id }) => {
      if (this.seenAnswerIds.has(id)) {
        return false;
      }
      this.seenAnswerIds.add(id);
      return true;
    });
    if (unique.length > 0) {
      this.state = { ...this.state, answers: [...this.state.answers, ...unique] };
    }
  }

  private reset(target: ZhihuTarget, order: AnswerOrder): void {
    this.seenAnswerIds = new Set();
    this.nextPageUrl = null;
    this.hasLoadedFirstPage = false;
    this.pageRequest = null;
    this.nextOperation = null;
    this.pendingJumpAnswerNumber = null;
    this.state = {
      ...emptySnapshot(order),
      target,
    };
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function emptySnapshot(order: AnswerOrder): ReaderSnapshot {
  return {
    phase: "idle",
    target: null,
    question: null,
    answers: [],
    currentIndex: -1,
    initialAnswerId: null,
    isLoadingNextPage: false,
    isEnd: false,
    errorMessage: null,
    navigationError: null,
    order,
  };
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "加载知乎内容时发生未知错误。";
}
