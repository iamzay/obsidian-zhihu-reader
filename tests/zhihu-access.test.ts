import { describe, expect, it } from "vitest";

import { canUseZhihuNetwork } from "@/auth/access";
import type {
  ZhihuAuthPhase,
  ZhihuAuthSnapshot,
} from "@/auth/types";

describe("Zhihu network access policy", () => {
  it("allows network features only for a verified authenticated session", () => {
    const phases: readonly ZhihuAuthPhase[] = [
      "anonymous",
      "verifying",
      "creating-qr",
      "waiting-web-login",
      "waiting-scan",
      "waiting-confirm",
      "authenticated",
      "expired",
      "cancelled",
      "risk-control",
      "error",
    ];

    expect(
      phases.map((phase) => [phase, canUseZhihuNetwork(snapshot(phase))]),
    ).toEqual([
      ["anonymous", false],
      ["verifying", false],
      ["creating-qr", false],
      ["waiting-web-login", false],
      ["waiting-scan", false],
      ["waiting-confirm", false],
      ["authenticated", true],
      ["expired", false],
      ["cancelled", false],
      ["risk-control", false],
      ["error", false],
    ]);
  });
});

function snapshot(phase: ZhihuAuthPhase): ZhihuAuthSnapshot {
  return {
    phase,
    profile: phase === "authenticated"
      ? { id: "1", name: "测试用户", urlToken: "test-user" }
      : null,
    qrDataUrl: null,
    expiresAt: null,
    message: null,
    riskControlUrl: null,
  };
}
