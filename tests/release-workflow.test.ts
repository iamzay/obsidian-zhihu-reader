import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

describe("release workflow", () => {
  it("uses the build-provenance action supported by the plugin scanner", () => {
    expect(releaseWorkflow).toContain(
      "uses: actions/attest-build-provenance@v2",
    );
    expect(releaseWorkflow).not.toContain("uses: actions/attest@v4");
  });
});
