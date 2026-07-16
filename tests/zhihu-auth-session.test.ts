import { describe, expect, it } from "vitest";

import type { QrCodeRenderer } from "@/auth/QrCodeRenderer";
import {
  emptyPersistedAuth,
  type AuthScheduler,
  ZhihuAuthSession,
  type ZhihuAuthPersistence,
} from "@/auth/ZhihuAuthSession";
import type { PersistedZhihuAuth } from "@/auth/types";
import { FixtureZhihuTransport } from "./support/FixtureZhihuTransport";

const renderQr: QrCodeRenderer = () =>
  Promise.resolve("data:image/png;base64,fixture-qr");

class MemoryAuthPersistence implements ZhihuAuthPersistence {
  value: PersistedZhihuAuth = emptyPersistedAuth();

  save(auth: PersistedZhihuAuth): Promise<void> {
    this.value = structuredClone(auth);
    return Promise.resolve();
  }
}

class ImmediateScheduler implements AuthScheduler {
  constructor(private time = 1_000) {}

  now(): number {
    return this.time;
  }

  sleep(milliseconds: number): Promise<void> {
    this.time += milliseconds;
    return Promise.resolve();
  }
}

describe("ZhihuAuthSession", () => {
  it("creates a QR code, observes scan confirmation and persists a verified session", async () => {
    let pollCount = 0;
    const persistence = new MemoryAuthPersistence();
    const transport = new FixtureZhihuTransport((request) => {
      if (request.url.endsWith("/signin?next=%2F")) {
        return ok("", { "set-cookie": "anonymous_context=ready; Path=/" });
      }
      if (request.url.endsWith("/udid") || request.url.includes("/captcha/")) {
        return ok("{}");
      }
      if (request.url.endsWith("/login/qrcode")) {
        return ok(
          JSON.stringify({
            token: "temporary-secret",
            link: "https://www.zhihu.com/account/scan/login/fixture",
            expires_at: 10,
          }),
        );
      }
      if (request.url.endsWith("/scan_info")) {
        pollCount += 1;
        return ok(
          pollCount === 1
            ? JSON.stringify({ status: 1 })
            : JSON.stringify({
                success: true,
                cookie: "session_cookie=session-secret; Path=/; HttpOnly",
              }),
        );
      }
      if (request.url.endsWith("/api/v4/me")) {
        return ok(
          JSON.stringify({
            id: "person-id",
            name: "测试用户",
            url_token: "test-user",
          }),
        );
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const auth = new ZhihuAuthSession(
      transport,
      persistence,
      renderQr,
      new ImmediateScheduler(),
    );

    const phases: string[] = [];
    auth.subscribe(({ phase }) => phases.push(phase));
    await auth.startQrLogin();

    expect(phases).toContain("waiting-scan");
    expect(phases).toContain("waiting-confirm");
    expect(auth.snapshot()).toMatchObject({
      phase: "authenticated",
      profile: { name: "测试用户" },
    });
    expect(persistence.value.cookies).toHaveProperty("session_cookie");
    expect(auth.getCookieHeader()).toContain("session_cookie=");
    expect(JSON.stringify(auth.snapshot())).not.toContain("temporary-secret");
    expect(JSON.stringify(auth.snapshot())).not.toContain("session-secret");
  });

  it("invalidates an authenticated session after an API authentication failure", async () => {
    const persistence = new MemoryAuthPersistence();
    const auth = new ZhihuAuthSession(
      new FixtureZhihuTransport(() =>
        ok(JSON.stringify({
          id: "person-id",
          name: "测试用户",
          url_token: "test-user",
        }))),
      persistence,
      renderQr,
      new ImmediateScheduler(),
    );
    await auth.verifyStoredSession({
      cookies: { z_c0: "session-secret" },
      profile: null,
      verifiedAt: 1,
    });
    expect(auth.snapshot().phase).toBe("authenticated");

    await auth.invalidateSession("知乎登录已失效，请重新登录。");

    expect(auth.snapshot()).toMatchObject({
      phase: "expired",
      message: "知乎登录已失效，请重新登录。",
    });
    expect(auth.getCookieHeader()).toBeUndefined();
    expect(persistence.value.cookies).toEqual({});
  });

  it("surfaces risk control and stops polling", async () => {
    const auth = new ZhihuAuthSession(
      loginTransport(() => ({
        status: 403,
        headers: {},
        text: JSON.stringify({
          error: {
            code: 40352,
            need_login: true,
            redirect: "/account/risk_control/",
          },
        }),
      })),
      new MemoryAuthPersistence(),
      renderQr,
      new ImmediateScheduler(),
    );

    await auth.startQrLogin();

    expect(auth.snapshot()).toMatchObject({
      phase: "risk-control",
      riskControlUrl: "https://www.zhihu.com/account/risk_control/",
    });
  });

  it("sends the complete browser context when polling login state", async () => {
    const transport = loginTransport(() => ({
      status: 403,
      headers: {},
      text: JSON.stringify({
        error: { code: 40352, need_login: true },
      }),
    }));
    const auth = new ZhihuAuthSession(
      transport,
      new MemoryAuthPersistence(),
      renderQr,
      new ImmediateScheduler(),
    );

    await auth.startQrLogin();

    const pollRequest = transport.requests.find(({ url }) =>
      url.endsWith("/scan_info"),
    );
    expect(pollRequest?.headers).toMatchObject({
      "accept-encoding": "gzip",
      "sec-ch-ua":
        '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-zse-93": "101_3_3.0",
    });
  });

  it("reuses the temporary cookie context after risk-control verification", async () => {
    const transport = new FixtureZhihuTransport((request) => {
      if (request.url.endsWith("/signin?next=%2F")) {
        return ok("", {
          "set-cookie": "anonymous_context=fixture; Path=/; HttpOnly",
        });
      }
      if (request.url.endsWith("/udid") || request.url.includes("/captcha/")) {
        return ok("{}");
      }
      if (request.url.endsWith("/login/qrcode")) {
        return ok(
          JSON.stringify({
            token: "temporary-secret",
            link: "https://www.zhihu.com/account/scan/login/fixture",
            expires_at: 10,
          }),
        );
      }
      if (request.url.endsWith("/scan_info")) {
        return {
          status: 403,
          headers: {},
          text: JSON.stringify({
            error: { code: 40352, need_login: true },
          }),
        };
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const auth = new ZhihuAuthSession(
      transport,
      new MemoryAuthPersistence(),
      renderQr,
      new ImmediateScheduler(),
    );

    await auth.startQrLogin();
    await auth.startQrLogin();

    const signinRequests = transport.requests.filter(({ url }) =>
      url.endsWith("/signin?next=%2F"),
    );
    expect(signinRequests).toHaveLength(2);
    expect(signinRequests[1]?.headers.Cookie).toContain(
      "anonymous_context=fixture",
    );
  });

  it("does not expose an untrusted risk-control redirect", async () => {
    const auth = new ZhihuAuthSession(
      loginTransport(() => ({
        status: 403,
        headers: {},
        text: JSON.stringify({
          error: {
            code: 40352,
            redirect: "https://not-zhihu.com/collect",
          },
        }),
      })),
      new MemoryAuthPersistence(),
      renderQr,
      new ImmediateScheduler(),
    );

    await auth.startQrLogin();

    expect(auth.snapshot().riskControlUrl).toBe(
      "https://www.zhihu.com/account/risk_control/",
    );
  });

  it("verifies the session when polling delivers the login cookie", async () => {
    const persistence = new MemoryAuthPersistence();
    const base = loginTransport(() =>
      ok("{}", { "set-cookie": "z_c0=fixture-session; Path=/; HttpOnly" }),
    );
    const transport = new FixtureZhihuTransport((request) => {
      if (request.url.endsWith("/api/v4/me")) {
        return ok(
          JSON.stringify({
            id: "person-id",
            name: "测试用户",
            url_token: "test-user",
          }),
        );
      }
      return base.request(request);
    });
    const auth = new ZhihuAuthSession(
      transport,
      persistence,
      renderQr,
      new ImmediateScheduler(),
    );

    await auth.startQrLogin();

    expect(auth.snapshot().phase).toBe("authenticated");
    expect(persistence.value.cookies).toHaveProperty("z_c0");
  });

  it("reports an expired QR code", async () => {
    const auth = new ZhihuAuthSession(
      loginTransport(() => ok("{}"), 1),
      new MemoryAuthPersistence(),
      renderQr,
      new ImmediateScheduler(1_000),
    );

    await auth.startQrLogin();

    expect(auth.snapshot().phase).toBe("expired");
  });

  it("keeps cancellation as the final state", async () => {
    const pending = deferred<{
      status: number;
      text: string;
      headers: Record<string, string>;
    }>();
    let requestedQr = false;
    const transport = new FixtureZhihuTransport((request) => {
      if (request.url.endsWith("/signin?next=%2F")) {
        return ok("");
      }
      if (request.url.endsWith("/udid") || request.url.includes("/captcha/")) {
        return ok("{}");
      }
      if (request.url.endsWith("/login/qrcode")) {
        requestedQr = true;
        return pending.promise;
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const auth = new ZhihuAuthSession(
      transport,
      new MemoryAuthPersistence(),
      renderQr,
      new ImmediateScheduler(),
    );

    const starting = auth.startQrLogin();
    await until(() => requestedQr);
    auth.cancel();
    pending.resolve(
      ok(
        JSON.stringify({
          token: "temporary-secret",
          link: "https://www.zhihu.com/account/scan/login/fixture",
        }),
      ),
    );
    await starting;

    expect(auth.snapshot().phase).toBe("cancelled");
  });

  it("clears an expired stored session and falls back to anonymous reading", async () => {
    const persistence = new MemoryAuthPersistence();
    const auth = new ZhihuAuthSession(
      new FixtureZhihuTransport(() => ({ status: 403, text: "{}" })),
      persistence,
      renderQr,
      new ImmediateScheduler(),
    );

    await auth.verifyStoredSession({
      cookies: { session_cookie: "expired-secret" },
      profile: null,
      verifiedAt: null,
    });

    expect(auth.snapshot().phase).toBe("expired");
    expect(persistence.value).toEqual(emptyPersistedAuth());
    expect(auth.getCookieHeader()).toBeUndefined();
  });

  it("reports network failure without exposing request credentials", async () => {
    const auth = new ZhihuAuthSession(
      new FixtureZhihuTransport(() => {
        throw new Error("offline");
      }),
      new MemoryAuthPersistence(),
      renderQr,
      new ImmediateScheduler(),
    );

    await auth.startQrLogin();

    expect(auth.snapshot()).toMatchObject({
      phase: "error",
      qrDataUrl: null,
    });
    expect(JSON.stringify(auth.snapshot())).not.toContain("Cookie");
  });

  it("logs out without touching unrelated plugin data", async () => {
    const persistence = new MemoryAuthPersistence();
    const auth = new ZhihuAuthSession(
      new FixtureZhihuTransport(() =>
        ok(
          JSON.stringify({
            id: "person-id",
            name: "测试用户",
            url_token: "test-user",
          }),
        ),
      ),
      persistence,
      renderQr,
      new ImmediateScheduler(),
    );
    await auth.verifyStoredSession({
      cookies: { session_cookie: "session-secret" },
      profile: null,
      verifiedAt: null,
    });

    await auth.logout();

    expect(auth.snapshot().phase).toBe("anonymous");
    expect(persistence.value).toEqual(emptyPersistedAuth());
  });
});

function loginTransport(
  poll: () => {
    status: number;
    text: string;
    headers: Record<string, string>;
  },
  expiresAt = 10,
): FixtureZhihuTransport {
  return new FixtureZhihuTransport((request) => {
    if (request.url.endsWith("/signin?next=%2F")) {
      return ok("");
    }
    if (request.url.endsWith("/udid") || request.url.includes("/captcha/")) {
      return ok("{}");
    }
    if (request.url.endsWith("/login/qrcode")) {
      return ok(
        JSON.stringify({
          token: "temporary-secret",
          link: "https://www.zhihu.com/account/scan/login/fixture",
          expires_at: expiresAt,
        }),
      );
    }
    if (request.url.endsWith("/scan_info")) {
      return poll();
    }
    throw new Error(`Unexpected request: ${request.url}`);
  });
}

function ok(
  text: string,
  headers: Record<string, string> = {},
): { status: number; text: string; headers: Record<string, string> } {
  return { status: 200, text, headers };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("Condition was not reached");
}
