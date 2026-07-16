import { Platform, type App } from "obsidian";

const WEB_VIEWER_PLUGIN_ID = "webviewer";
const WEB_VIEWER_VIEW_TYPE = "webviewer";
const ZHIHU_LOGIN_URL = "https://www.zhihu.com/signin";
const ZHIHU_SESSION_URL = "https://www.zhihu.com";
const ZHIHU_COOKIE_PROBE_URL = "https://www.zhihu.com/question/19550225";
const WAIT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

interface ElectronCookie {
  readonly name: string;
  readonly value: string;
}

interface ElectronSession {
  readonly cookies: {
    get(filter: { readonly url: string }): Promise<readonly ElectronCookie[]>;
  };
}

export interface WebViewerLoginRuntime {
  readonly isMobile: boolean;
  getSession(webview: WebviewElement): ElectronSession;
  sleep(milliseconds: number, signal: AbortSignal): Promise<void>;
}

interface WebviewElement {
  getWebContentsId?(): number;
  getURL?(): string;
  loadURL?(url: string): Promise<void>;
}

interface WebViewerLeaf {
  readonly view?: {
    readonly contentEl?: {
      querySelector?(selector: string): WebviewElement | null;
    };
  };
  detach?(): Promise<void> | void;
}

interface WebViewerInstance {
  openUrl(url: string, newLeaf: boolean, active: boolean): void;
}

interface AppWithInternalPlugins extends App {
  readonly internalPlugins?: {
    getPluginById?(id: string): {
      readonly enabled?: boolean;
      readonly instance?: WebViewerInstance;
    } | null;
  };
}

export class WebViewerZhihuLogin {
  constructor(
    private readonly app: App,
    private readonly runtime: WebViewerLoginRuntime = defaultRuntime(),
  ) {}

  async collectCookies(signal: AbortSignal): Promise<Readonly<Record<string, string>>> {
    if (this.runtime.isMobile) {
      throw new Error("Obsidian Web viewer 仅支持桌面端。");
    }
    const webViewer = webViewerInstance(this.app);
    if (webViewer === null) {
      throw new Error(
        "请先在“设置 → 核心插件”中启用 Web viewer（网页浏览器）。",
      );
    }

    const leavesBeforeOpen = new Set(this.webViewerLeaves());
    webViewer.openUrl(ZHIHU_LOGIN_URL, true, true);
    const leaf = await this.waitForLeaf(leavesBeforeOpen, signal);
    try {
      const webview = await this.waitForWebview(leaf, signal);
      const session = await this.waitForSession(webview, signal);
      return await this.waitForCookies(webview, session, signal);
    } finally {
      await leaf.detach?.();
    }
  }

  private webViewerLeaves(): readonly WebViewerLeaf[] {
    return this.app.workspace.getLeavesOfType(
      WEB_VIEWER_VIEW_TYPE,
    ) as unknown as readonly WebViewerLeaf[];
  }

  private async waitForLeaf(
    leavesBeforeOpen: ReadonlySet<WebViewerLeaf>,
    signal: AbortSignal,
  ): Promise<WebViewerLeaf> {
    return await this.waitUntil(() => {
      const leaves = this.webViewerLeaves();
      return leaves.find((leaf) => !leavesBeforeOpen.has(leaf)) ??
        leaves.at(-1) ??
        null;
    }, "等待 Web viewer 打开超时。", signal);
  }

  private async waitForWebview(
    leaf: WebViewerLeaf,
    signal: AbortSignal,
  ): Promise<WebviewElement> {
    return await this.waitUntil(
      () => leaf.view?.contentEl?.querySelector?.("webview") ?? null,
      "等待 Web viewer 初始化超时。",
      signal,
    );
  }

  private async waitForSession(
    webview: WebviewElement,
    signal: AbortSignal,
  ): Promise<ElectronSession> {
    return await this.waitUntil(() => {
      try {
        return webview.getWebContentsId?.() === undefined
          ? null
          : this.runtime.getSession(webview);
      } catch {
        return null;
      }
    }, "无法读取 Web viewer 登录会话。", signal);
  }

  private async waitForCookies(
    webview: WebviewElement,
    session: ElectronSession,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, string>>> {
    let openedCookieProbe = false;
    return await this.waitUntil(async () => {
      const currentUrl = webview.getURL?.() ?? "";
      if (isLoginPage(currentUrl)) {
        return null;
      }
      const cookies = cookieRecord(
        await session.cookies.get({ url: ZHIHU_SESSION_URL }),
      );
      const hasSessionCookies =
        cookies.z_c0 !== undefined && cookies.d_c0 !== undefined;
      if (
        hasSessionCookies &&
        cookies.__zse_ck === undefined &&
        !openedCookieProbe
      ) {
        openedCookieProbe = true;
        const navigation = webview.loadURL?.(ZHIHU_COOKIE_PROBE_URL);
        await navigation?.catch((error: unknown) => {
          if (!isIgnorableNavigationError(error)) {
            throw error;
          }
        });
        return null;
      }
      return hasSessionCookies && cookies.__zse_ck !== undefined
        ? cookies
        : null;
    }, "等待知乎网页登录完成超时，请重新尝试。", signal);
  }

  private async waitUntil<T>(
    read: () => T | null | Promise<T | null>,
    timeoutMessage: string,
    signal: AbortSignal,
  ): Promise<T> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      throwIfAborted(signal);
      const value = await read();
      if (value !== null) {
        return value;
      }
      await this.runtime.sleep(POLL_INTERVAL_MS, signal);
    }
    throw new Error(timeoutMessage);
  }
}

export function isWebViewerEnabled(app: App): boolean {
  return webViewerAvailability(app) === "enabled";
}

export function webViewerAvailability(
  app: App,
): "enabled" | "disabled" | "unsupported" {
  if (Platform.isMobile) {
    return "unsupported";
  }
  return webViewerInstance(app) === null ? "disabled" : "enabled";
}

export function cookieRecord(
  cookies: readonly ElectronCookie[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(cookies.map(({ name, value }) => [name, value]));
}

function webViewerInstance(app: App): WebViewerInstance | null {
  const plugin = (app as AppWithInternalPlugins).internalPlugins
    ?.getPluginById?.(WEB_VIEWER_PLUGIN_ID);
  return plugin?.enabled === true && plugin.instance !== undefined
    ? plugin.instance
    : null;
}

function defaultRuntime(): WebViewerLoginRuntime {
  return {
    isMobile: Platform.isMobile,
    getSession(webview) {
      const requireValue: unknown = Reflect.get(window, "require");
      if (typeof requireValue !== "function") {
        throw new Error("无法访问 Electron 模块加载器。");
      }
      const requireElectron = requireValue as (id: string) => unknown;
      const remote = requireElectron("@electron/remote");
      const webContents = objectField(remote, "webContents");
      const fromId = objectField(webContents, "fromId");
      const id = webview.getWebContentsId?.();
      const contents =
        id === undefined || typeof fromId !== "function"
          ? undefined
          : Reflect.apply(fromId, webContents, [id]) as unknown;
      const session = objectField(contents, "session");
      if (!isElectronSession(session)) {
        throw new Error("无法访问 Web viewer 的 Electron 会话。");
      }
      return session;
    },
    sleep(milliseconds, signal) {
      return new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
          window.clearTimeout(timer);
          reject(abortError());
        };
        const timer = window.setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, milliseconds);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  return new Error("已取消网页登录。");
}

function objectField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

function isElectronSession(value: unknown): value is ElectronSession {
  const cookies = objectField(value, "cookies");
  return typeof objectField(cookies, "get") === "function";
}

function isLoginPage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.hostname === "www.zhihu.com" || url.hostname === "zhihu.com") &&
      url.pathname.startsWith("/signin")
    );
  } catch {
    return true;
  }
}

function isIgnorableNavigationError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.includes("ERR_ABORTED") || message.includes("(-3)");
}
