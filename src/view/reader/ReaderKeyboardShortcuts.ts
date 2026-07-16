export type ReaderShortcut =
  | "previous-answer"
  | "scroll-down"
  | "scroll-up"
  | "next-answer";

export interface ReaderShortcutEvent {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly defaultPrevented: boolean;
  readonly isComposing: boolean;
  readonly repeat: boolean;
}

export function resolveReaderShortcut(
  event: ReaderShortcutEvent,
  isEditableTarget: boolean,
): ReaderShortcut | null {
  if (
    isEditableTarget ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (event.repeat && (key === "h" || key === "l")) {
    return null;
  }
  switch (key) {
    case "h":
      return "previous-answer";
    case "j":
      return "scroll-down";
    case "k":
      return "scroll-up";
    case "l":
      return "next-answer";
    default:
      return null;
  }
}

export function readerScrollDistance(viewportHeight: number): number {
  return Math.max(160, Math.round(viewportHeight * 0.72));
}
