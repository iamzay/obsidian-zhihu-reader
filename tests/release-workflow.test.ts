import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

describe("release workflow", () => {
  it("publishes release assets without generating attestations", () => {
    expect(releaseWorkflow).not.toContain("attestations: write");
    expect(releaseWorkflow).not.toContain("id-token: write");
    expect(releaseWorkflow).not.toContain("actions/attest");
    expect(releaseWorkflow).toContain(
      "gh release create \"$GITHUB_REF_NAME\"",
    );
  });
});
