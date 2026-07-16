import { describe, expect, it } from "vitest";

import type { App } from "obsidian";

import {
  cookieRecord,
  isWebViewerEnabled,
  WebViewerZhihuLogin,
  type WebViewerLoginRuntime,
} from "@/auth/WebViewerZhihuLogin";

describe("WebViewerZhihuLogin", () => {
  it("opens the core Web viewer and returns its Zhihu session cookies", async () => {
    let openedUrl: string | null = null;
    let detached = false;
    const webview = {
      getWebContentsId: () => 42,
      getURL: () => "https://www.zhihu.com/",
    };
    const leaf = {
      view: {
        contentEl: {
          querySelector: () => webview,
        },
      },
      detach: () => {
        detached = true;
      },
    };
    const app = fakeApp({
      openUrl: (url) => {
        openedUrl = url;
      },
      leaves: [leaf],
    });
    const runtime: WebViewerLoginRuntime = {
      isMobile: false,
      getSession: () => ({
        cookies: {
          get: () =>
            Promise.resolve([
              { name: "z_c0", value: "session" },
              { name: "d_c0", value: "device" },
              { name: "__zse_ck", value: "signature-cookie" },
            ]),
        },
      }),
      sleep: () => Promise.resolve(),
    };

    const cookies = await new WebViewerZhihuLogin(
      app,
      runtime,
    ).collectCookies(new AbortController().signal);

    expect(openedUrl).toBe("https://www.zhihu.com/signin");
    expect(cookies).toEqual({
      z_c0: "session",
      d_c0: "device",
      __zse_ck: "signature-cookie",
    });
    expect(detached).toBe(true);
  });

  it("rejects the recommended login when the core plugin is disabled", async () => {
    const app = fakeApp({ openUrl: () => undefined, leaves: [], enabled: false });
    const runtime: WebViewerLoginRuntime = {
      isMobile: false,
      getSession: () => {
        throw new Error("Not used");
      },
      sleep: () => Promise.resolve(),
    };

    await expect(
      new WebViewerZhihuLogin(app, runtime).collectCookies(
        new AbortController().signal,
      ),
    ).rejects.toThrow("启用 Web viewer");
    expect(isWebViewerEnabled(app)).toBe(false);
  });

  it("opens a public question until the ZSE cookie is available", async () => {
    let currentUrl = "https://www.zhihu.com/";
    let cookieReads = 0;
    const webview = {
      getWebContentsId: () => 42,
      getURL: () => currentUrl,
      loadURL: (url: string) => {
        currentUrl = url;
        return Promise.resolve();
      },
    };
    const app = fakeApp({
      openUrl: () => undefined,
      leaves: [{
        view: {
          contentEl: {
            querySelector: () => webview,
          },
        },
      }],
    });
    const runtime: WebViewerLoginRuntime = {
      isMobile: false,
      getSession: () => ({
        cookies: {
          get: () => {
            cookieReads += 1;
            return Promise.resolve([
              { name: "z_c0", value: "session" },
              { name: "d_c0", value: "device" },
              ...(cookieReads > 1
                ? [{ name: "__zse_ck", value: "fresh-zse" }]
                : []),
            ]);
          },
        },
      }),
      sleep: () => Promise.resolve(),
    };

    const cookies = await new WebViewerZhihuLogin(
      app,
      runtime,
    ).collectCookies(new AbortController().signal);

    expect(currentUrl).toBe("https://www.zhihu.com/question/19550225");
    expect(cookies.__zse_ck).toBe("fresh-zse");
  });

  it("converts Electron cookies to the persisted record format", () => {
    expect(cookieRecord([
      { name: "z_c0", value: "first" },
      { name: "z_c0", value: "latest" },
      { name: "d_c0", value: "device" },
    ])).toEqual({
      z_c0: "latest",
      d_c0: "device",
    });
  });
});

function fakeApp({
  openUrl,
  leaves,
  enabled = true,
}: {
  readonly openUrl: (url: string) => void;
  readonly leaves: readonly unknown[];
  readonly enabled?: boolean;
}): App {
  return {
    internalPlugins: {
      getPluginById: () => ({
        enabled,
        instance: { openUrl },
      }),
    },
    workspace: {
      getLeavesOfType: () => leaves,
    },
  } as unknown as App;
}
