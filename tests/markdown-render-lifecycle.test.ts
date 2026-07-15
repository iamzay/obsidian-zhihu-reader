import { describe, expect, it } from "vitest";

import {
  type MarkdownRenderElement,
  startMarkdownRender,
} from "@/view/reader/MarkdownRenderLifecycle";

class FakeElement implements MarkdownRenderElement {
  readonly values: string[] = [];
  readonly children: FakeElement[] = [];
  removed = false;

  empty(): void {
    this.values.length = 0;
    this.children.length = 0;
  }

  createDiv(): FakeElement {
    const child = new FakeElement();
    this.children.push(child);
    return child;
  }

  remove(): void {
    this.removed = true;
  }

  append(value: string): void {
    this.values.push(value);
  }

  visibleValues(): string[] {
    return [
      ...this.values,
      ...this.children.flatMap((child) =>
        child.removed ? [] : child.visibleValues(),
      ),
    ];
  }
}

describe("startMarkdownRender", () => {
  it("does not expose content appended by a disposed asynchronous render", async () => {
    const container = new FakeElement();
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const oldRender = startMarkdownRender(
      container,
      async (host) => {
        await oldGate;
        (host as FakeElement).append("old answer tail");
      },
      () => undefined,
    );

    oldRender.dispose();
    const currentRender = startMarkdownRender(
      container,
      (host) => {
        (host as FakeElement).append("current answer");
        return Promise.resolve();
      },
      () => undefined,
    );
    releaseOld();
    await Promise.all([oldRender.completion, currentRender.completion]);

    expect(container.visibleValues()).toEqual(["current answer"]);
  });
});
