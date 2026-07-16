import { describe, expect, it } from "vitest";

import {
  readerScrollDistance,
  resolveReaderShortcut,
  type ReaderShortcutEvent,
} from "@/view/reader/ReaderKeyboardShortcuts";

const baseEvent: ReaderShortcutEvent = {
  key: "",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  defaultPrevented: false,
  isComposing: false,
  repeat: false,
};

describe("reader keyboard shortcuts", () => {
  it.each([
    ["h", "previous-answer"],
    ["H", "previous-answer"],
    ["j", "scroll-down"],
    ["k", "scroll-up"],
    ["l", "next-answer"],
  ] as const)("maps %s to %s", (key, expected) => {
    expect(resolveReaderShortcut({ ...baseEvent, key }, false)).toBe(expected);
  });

  it("does not intercept typing, composition, handled events or modifiers", () => {
    expect(resolveReaderShortcut({ ...baseEvent, key: "j" }, true)).toBeNull();
    expect(
      resolveReaderShortcut(
        { ...baseEvent, key: "j", isComposing: true },
        false,
      ),
    ).toBeNull();
    expect(
      resolveReaderShortcut(
        { ...baseEvent, key: "j", defaultPrevented: true },
        false,
      ),
    ).toBeNull();
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(
        resolveReaderShortcut(
          { ...baseEvent, key: "j", [modifier]: true },
          false,
        ),
      ).toBeNull();
    }
  });

  it("allows held scrolling but prevents held answer switching", () => {
    expect(
      resolveReaderShortcut(
        { ...baseEvent, key: "j", repeat: true },
        false,
      ),
    ).toBe("scroll-down");
    expect(
      resolveReaderShortcut(
        { ...baseEvent, key: "h", repeat: true },
        false,
      ),
    ).toBeNull();
    expect(
      resolveReaderShortcut(
        { ...baseEvent, key: "l", repeat: true },
        false,
      ),
    ).toBeNull();
  });

  it("scrolls by roughly seventy percent of the viewport with a minimum step", () => {
    expect(readerScrollDistance(1000)).toBe(720);
    expect(readerScrollDistance(100)).toBe(160);
  });
});
