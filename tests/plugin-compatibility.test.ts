import { describe, expect, it } from "vitest";

import manifest from "../manifest.json";

const CURRENT_SUPPORTED_OBSIDIAN_VERSION = "1.9.14";

describe("plugin compatibility", () => {
  it("can be loaded by the current supported Obsidian release", () => {
    expect(
      compareVersions(
        CURRENT_SUPPORTED_OBSIDIAN_VERSION,
        manifest.minAppVersion,
      ),
    ).toBeGreaterThanOrEqual(0);
  });
});

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference =
      (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}
