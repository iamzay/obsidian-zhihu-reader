import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HttpZhihuGateway, ZhihuGatewayError } from "@/zhihu/gateway";
import { FixtureZhihuTransport } from "./support/FixtureZhihuTransport";

function fixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/zhihu/${name}`, import.meta.url),
    "utf8",
  );
}

describe("HttpZhihuGateway", () => {
  it("loads a direct answer through the transport seam", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("answer.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);

    const answer = await gateway.getAnswer("90071992547409931234");

    expect(answer.id).toBe("90071992547409931234");
    expect(answer.question.title).toBe("如何在 Obsidian 中建立阅读工作流？");
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toContain(
      "/api/v4/answers/90071992547409931234?include=",
    );
  });

  it.each([
    [403, "forbidden"],
    [404, "not-found"],
    [429, "rate-limited"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => ({ status, text: "" })),
    );

    const request = gateway.getAnswer("123");
    await expect(request).rejects.toBeInstanceOf(ZhihuGatewayError);
    await expect(request).rejects.toMatchObject({ kind });
  });

  it("maps schema changes to a recoverable response error", async () => {
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => ({
        status: 200,
        text: '{"type":"answer","id":"123"}',
      })),
    );

    await expect(gateway.getAnswer("123")).rejects.toMatchObject({
      kind: "response",
    });
  });

  it("maps transport failures to a network error", async () => {
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => {
        throw new Error("offline");
      }),
    );

    await expect(gateway.getAnswer("123")).rejects.toMatchObject({
      kind: "network",
    });
  });
});
