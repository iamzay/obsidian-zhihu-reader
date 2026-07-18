import type { QuestionSummary } from "@/domain/zhihu";

export interface QuestionHistoryEntry {
  readonly questionId: string;
  readonly questionTitle: string;
  readonly lastQueriedAt: string;
  readonly lastAnswerNumber: number;
}

export interface QuestionHistoryPolicy {
  readonly limit: number;
}

export interface QuestionHistoryPersistence {
  save(entries: readonly QuestionHistoryEntry[]): Promise<void>;
}

export class QuestionHistory {
  private entries: QuestionHistoryEntry[];
  private policy: QuestionHistoryPolicy;
  private readonly listeners = new Set<
    (entries: readonly QuestionHistoryEntry[]) => void
  >();
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    initialEntries: readonly QuestionHistoryEntry[],
    policy: QuestionHistoryPolicy,
    private readonly persistence: QuestionHistoryPersistence,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.policy = validatePolicy(policy);
    this.entries = normalizeEntries(initialEntries, this.policy.limit);
  }

  list(): readonly QuestionHistoryEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  subscribe(
    listener: (entries: readonly QuestionHistoryEntry[]) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => this.listeners.delete(listener);
  }

  record(question: QuestionSummary, answerNumber = 1): Promise<void> {
    const next: QuestionHistoryEntry = {
      questionId: question.id,
      questionTitle: question.title,
      lastQueriedAt: this.now().toISOString(),
      lastAnswerNumber: validateAnswerNumber(answerNumber),
    };
    this.entries = [
      next,
      ...this.entries.filter(({ questionId }) => questionId !== question.id),
    ].slice(0, this.policy.limit);
    return this.changed();
  }

  updatePosition(questionId: string, answerNumber: number): Promise<void> {
    const index = this.entries.findIndex((entry) => entry.questionId === questionId);
    if (index < 0) {
      return Promise.resolve();
    }
    const lastAnswerNumber = validateAnswerNumber(answerNumber);
    const current = this.entries[index];
    if (current?.lastAnswerNumber === lastAnswerNumber) {
      return Promise.resolve();
    }
    this.entries = this.entries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, lastAnswerNumber } : entry,
    );
    return this.changed();
  }

  remove(questionId: string): Promise<void> {
    const entries = this.entries.filter((entry) => entry.questionId !== questionId);
    if (entries.length === this.entries.length) {
      return Promise.resolve();
    }
    this.entries = entries;
    return this.changed();
  }

  clear(): Promise<void> {
    if (this.entries.length === 0) {
      return Promise.resolve();
    }
    this.entries = [];
    return this.changed();
  }

  updatePolicy(policy: QuestionHistoryPolicy): Promise<void> {
    this.policy = validatePolicy(policy);
    if (this.entries.length <= this.policy.limit) {
      return Promise.resolve();
    }
    this.entries = this.entries.slice(0, this.policy.limit);
    return this.changed();
  }

  private changed(): Promise<void> {
    this.emit();
    const snapshot = this.list();
    const operation = this.persistenceQueue
      .catch(() => undefined)
      .then(() => this.persistence.save(snapshot));
    this.persistenceQueue = operation;
    return operation;
  }

  private emit(): void {
    const snapshot = this.list();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function normalizeEntries(
  entries: readonly QuestionHistoryEntry[],
  limit: number,
): QuestionHistoryEntry[] {
  const byQuestion = new Map<string, QuestionHistoryEntry>();
  for (const entry of [...entries].sort((left, right) =>
    right.lastQueriedAt.localeCompare(left.lastQueriedAt),
  )) {
    if (!byQuestion.has(entry.questionId)) {
      byQuestion.set(entry.questionId, { ...entry });
    }
  }
  return [...byQuestion.values()].slice(0, limit);
}

function validatePolicy(policy: QuestionHistoryPolicy): QuestionHistoryPolicy {
  if (!Number.isInteger(policy.limit) || policy.limit < 1) {
    throw new Error("History limit must be a positive integer.");
  }
  return { ...policy };
}

function validateAnswerNumber(answerNumber: number): number {
  if (!Number.isInteger(answerNumber) || answerNumber < 1) {
    throw new Error("Answer number must be a positive integer.");
  }
  return answerNumber;
}
