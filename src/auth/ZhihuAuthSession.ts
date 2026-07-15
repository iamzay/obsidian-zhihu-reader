import { z } from "zod";

import { CookieJar } from "@/auth/CookieJar";
import type { QrCodeRenderer } from "@/auth/QrCodeRenderer";
import type {
  PersistedZhihuAuth,
  ZhihuAuthProfile,
  ZhihuAuthSnapshot,
} from "@/auth/types";
import type {
  ZhihuTransport,
  ZhihuTransportRequest,
  ZhihuTransportResponse,
} from "@/zhihu/transport";
import {
  ZHIHU_DESKTOP_USER_AGENT,
  ZHIHU_WEB_ZSE93,
} from "@/zhihu/fetchSignature";

const ZHIHU_HOME_URL = "https://www.zhihu.com/";
const ZHIHU_SIGNIN_URL = "https://www.zhihu.com/signin?next=%2F";
const ZHIHU_SIGNIN_REFERER = "https://www.zhihu.com/signin";
const ZHIHU_QR_URL = "https://www.zhihu.com/api/v3/account/api/login/qrcode";
const ZHIHU_ME_URL = "https://www.zhihu.com/api/v4/me";
const ZHIHU_RISK_CONTROL_URL = "https://www.zhihu.com/account/risk_control/";
const SEC_CH_UA =
  '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"';
const SEC_CH_UA_MOBILE = "?0";
const SEC_CH_UA_PLATFORM = '"Windows"';

const qrResponseSchema = z.object({
  expires_at: z.number().optional(),
  link: z.string().url(),
  token: z.string().min(1).optional(),
  qrcode_token: z.string().min(1).optional(),
});

const scanInfoSchema = z
  .object({
    status: z.number().optional(),
    cookie: z.string().optional(),
    cookies: z.string().optional(),
    z_c0: z.string().optional(),
    user_id: z.string().optional(),
    access_token: z.string().optional(),
    success: z.boolean().optional(),
    logged_in: z.boolean().optional(),
    login_status: z.string().optional(),
    error: z
      .object({
        need_login: z.boolean().optional(),
        redirect: z.string().optional(),
        code: z.number().optional(),
        message: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url_token: z.string().catch(""),
  avatar_url: z.string().url().optional().catch(undefined),
});

export interface ZhihuAuthPersistence {
  save(auth: PersistedZhihuAuth): Promise<void>;
}

export interface AuthScheduler {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

const browserScheduler: AuthScheduler = {
  now: () => Date.now(),
  sleep: async (milliseconds) =>
    await new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
};

export class ZhihuAuthSession {
  private readonly listeners = new Set<(snapshot: ZhihuAuthSnapshot) => void>();
  private activeJar = new CookieJar();
  private pendingRiskControlJar: CookieJar | null = null;
  private generation = 0;
  private state: ZhihuAuthSnapshot = anonymousSnapshot();

  constructor(
    private readonly transport: ZhihuTransport,
    private readonly persistence: ZhihuAuthPersistence,
    private readonly renderQrCode: QrCodeRenderer,
    private readonly scheduler: AuthScheduler = browserScheduler,
  ) {}

  subscribe(listener: (snapshot: ZhihuAuthSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): ZhihuAuthSnapshot {
    return { ...this.state };
  }

  getCookieHeader(): string | undefined {
    return this.state.phase === "authenticated"
      ? this.activeJar.toHeader()
      : undefined;
  }

  async verifyStoredSession(auth: PersistedZhihuAuth): Promise<void> {
    if (Object.keys(auth.cookies).length === 0) {
      this.state = anonymousSnapshot();
      this.emit();
      return;
    }
    const generation = ++this.generation;
    this.state = {
      ...anonymousSnapshot(),
      phase: "verifying",
      message: "正在验证知乎登录状态…",
    };
    this.emit();
    const jar = new CookieJar(auth.cookies);
    try {
      const profile = await this.verify(jar);
      if (!this.isCurrent(generation)) {
        return;
      }
      if (profile === null) {
        await this.persistence.save(emptyPersistedAuth());
        this.state = {
          ...anonymousSnapshot(),
          phase: "expired",
          message: "知乎登录已过期，已切换为匿名阅读。",
        };
      } else {
        await this.acceptAuthenticated(jar, profile);
      }
    } catch (error: unknown) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.state = {
        ...anonymousSnapshot(),
        phase: "error",
        message: `登录状态验证失败，当前使用匿名阅读：${errorMessage(error)}`,
      };
    }
    this.emit();
  }

  async startQrLogin(): Promise<void> {
    const generation = ++this.generation;
    this.state = {
      ...anonymousSnapshot(),
      phase: "creating-qr",
      message: "正在创建登录二维码…",
    };
    this.emit();

    const jar = this.pendingRiskControlJar ?? new CookieJar();
    this.pendingRiskControlJar = null;
    try {
      await this.prefetch(jar);
      const response = await this.requestWithJar(jar, {
        url: ZHIHU_QR_URL,
        method: "POST",
        headers: loginHeaders(ZHIHU_SIGNIN_REFERER, jar),
        body: "{}",
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`二维码创建失败（${response.status}）`);
      }
      const qr = qrResponseSchema.parse(parseJson(response.text));
      const token = qr.token ?? qr.qrcode_token;
      if (token === undefined) {
        throw new Error("二维码响应缺少轮询凭据。");
      }
      const expiresAt = normalizeExpiresAt(qr.expires_at, this.scheduler.now());
      const qrDataUrl = await this.renderQrCode(qr.link);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.state = {
        phase: "waiting-scan",
        profile: null,
        qrDataUrl,
        expiresAt,
        message: "请使用知乎 App 扫描二维码。",
        riskControlUrl: null,
      };
      this.emit();
      await this.poll(jar, token, expiresAt, generation);
    } catch (error: unknown) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.state = {
        ...anonymousSnapshot(),
        phase: "error",
        message: `二维码登录失败：${errorMessage(error)}`,
      };
      this.emit();
    }
  }

  cancel(): void {
    this.generation += 1;
    this.pendingRiskControlJar = null;
    this.state = {
      ...anonymousSnapshot(),
      phase: "cancelled",
      message: "已取消二维码登录。",
    };
    this.emit();
  }

  async logout(): Promise<void> {
    this.generation += 1;
    this.activeJar = new CookieJar();
    this.pendingRiskControlJar = null;
    await this.persistence.save(emptyPersistedAuth());
    this.state = anonymousSnapshot();
    this.emit();
  }

  dispose(): void {
    this.generation += 1;
    this.pendingRiskControlJar = null;
    this.listeners.clear();
  }

  private async poll(
    jar: CookieJar,
    token: string,
    expiresAt: number,
    generation: number,
  ): Promise<void> {
    while (this.isCurrent(generation) && this.scheduler.now() <= expiresAt) {
      const response = await this.requestWithJar(jar, {
        url: `${ZHIHU_QR_URL}/${encodeURIComponent(token)}/scan_info`,
        headers: pollingHeaders(jar),
      });
      const infoResult = scanInfoSchema.safeParse(parseJsonSafe(response.text));
      const info = infoResult.success ? infoResult.data : {};
      updateJarFromScanInfo(jar, info);

      if (
        response.status === 403 &&
        (info.error?.code === 40352 || info.error?.need_login === true)
      ) {
        this.pendingRiskControlJar = jar;
        this.state = {
          ...anonymousSnapshot(),
          phase: "risk-control",
          message:
            info.error?.message ??
            "知乎限制了当前网络环境的登录请求，请先完成验证。",
          riskControlUrl: safeRiskControlUrl(info.error?.redirect),
        };
        this.emit();
        return;
      }

      if (info.status === 1 && this.state.phase !== "waiting-confirm") {
        this.state = {
          ...this.state,
          phase: "waiting-confirm",
          message: "二维码已扫描，请在手机上确认登录。",
        };
        this.emit();
      }

      if (isLoginSuccessful(info) || jar.get("z_c0") !== undefined) {
        const profile = await this.verify(jar);
        if (profile === null) {
          throw new Error("扫码完成，但会话验证失败。");
        }
        if (!this.isCurrent(generation)) {
          return;
        }
        await this.acceptAuthenticated(jar, profile);
        this.emit();
        return;
      }

      if (response.status >= 400) {
        throw new Error(`轮询登录状态失败（${response.status}）`);
      }
      await this.scheduler.sleep(500);
    }

    if (this.isCurrent(generation)) {
      this.state = {
        ...anonymousSnapshot(),
        phase: "expired",
        message: "登录二维码已过期，请重新生成。",
      };
      this.emit();
    }
  }

  private async prefetch(jar: CookieJar): Promise<void> {
    await this.requestWithJar(jar, {
      url: ZHIHU_SIGNIN_URL,
      headers: desktopHeaders(ZHIHU_HOME_URL),
    });
    await Promise.allSettled([
      this.requestWithJar(jar, {
        url: "https://www.zhihu.com/udid",
        method: "POST",
        headers: loginHeaders(ZHIHU_SIGNIN_REFERER, jar),
        body: "{}",
      }),
      this.requestWithJar(jar, {
        url: "https://www.zhihu.com/api/v3/oauth/captcha/v2?type=captcha_sign_in",
        headers: loginHeaders(ZHIHU_SIGNIN_REFERER, jar),
      }),
    ]);
  }

  private async verify(jar: CookieJar): Promise<ZhihuAuthProfile | null> {
    const response = await this.requestWithJar(jar, {
      url: ZHIHU_ME_URL,
      headers: loginHeaders(ZHIHU_HOME_URL, jar),
    });
    if (response.status === 401 || response.status === 403) {
      return null;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`会话验证失败（${response.status}）`);
    }
    const profile = profileSchema.parse(parseJson(response.text));
    return {
      id: profile.id,
      name: profile.name,
      urlToken: profile.url_token,
      ...(profile.avatar_url === undefined
        ? {}
        : { avatarUrl: profile.avatar_url }),
    };
  }

  private async requestWithJar(
    jar: CookieJar,
    request: ZhihuTransportRequest,
  ): Promise<ZhihuTransportResponse> {
    const cookie = jar.toHeader();
    const response = await this.transport.request({
      ...request,
      headers: {
        ...request.headers,
        ...(cookie === undefined ? {} : { Cookie: cookie }),
      },
    });
    jar.updateFromHeaders(response.headers);
    return response;
  }

  private async acceptAuthenticated(
    jar: CookieJar,
    profile: ZhihuAuthProfile,
  ): Promise<void> {
    const auth: PersistedZhihuAuth = {
      cookies: jar.toRecord(),
      profile,
      verifiedAt: this.scheduler.now(),
    };
    await this.persistence.save(auth);
    this.activeJar = jar;
    this.pendingRiskControlJar = null;
    this.state = {
      ...anonymousSnapshot(),
      phase: "authenticated",
      profile,
      message: `已登录：${profile.name}`,
    };
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function desktopHeaders(referer: string): Record<string, string> {
  return {
    "accept-encoding": "gzip",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
    "User-Agent": ZHIHU_DESKTOP_USER_AGENT,
    "sec-ch-ua": SEC_CH_UA,
    "sec-ch-ua-mobile": SEC_CH_UA_MOBILE,
    "sec-ch-ua-platform": SEC_CH_UA_PLATFORM,
  };
}

function loginHeaders(referer: string, jar: CookieJar): Record<string, string> {
  return {
    ...desktopHeaders(referer),
    Origin: "https://www.zhihu.com",
    "Content-Type": "application/json;charset=UTF-8",
    "x-requested-with": "fetch",
    ...(jar.get("_xsrf") === undefined
      ? {}
      : { "x-xsrftoken": jar.get("_xsrf") ?? "" }),
  };
}

function pollingHeaders(jar: CookieJar): Record<string, string> {
  return {
    ...loginHeaders(ZHIHU_SIGNIN_URL, jar),
    Accept: "*/*",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-zse-93": ZHIHU_WEB_ZSE93,
  };
}

function updateJarFromScanInfo(
  jar: CookieJar,
  info: z.output<typeof scanInfoSchema>,
): void {
  if (info.cookie !== undefined) {
    jar.updateFromCookieAssignments(info.cookie);
  }
  if (info.cookies !== undefined) {
    jar.updateFromCookieAssignments(info.cookies);
  }
  if (info.z_c0 !== undefined) {
    jar.set("z_c0", info.z_c0);
  }
}

function isLoginSuccessful(info: z.output<typeof scanInfoSchema>): boolean {
  if (
    info.user_id !== undefined ||
    info.access_token !== undefined ||
    info.success === true ||
    info.logged_in === true
  ) {
    return true;
  }
  return new Set(["CONFIRMED", "LOGIN_SUCCESS", "SUCCESS", "OK", "LOGGED_IN"]).has(
    info.login_status?.toUpperCase() ?? "",
  );
}

function normalizeExpiresAt(value: number | undefined, now: number): number {
  if (value === undefined || value <= 0) {
    return now + 120_000;
  }
  return value < 10_000_000_000 ? value * 1000 : value;
}

function safeRiskControlUrl(value: string | undefined): string {
  if (value === undefined) {
    return ZHIHU_RISK_CONTROL_URL;
  }
  try {
    const url = new URL(value, ZHIHU_HOME_URL);
    const isZhihuHost =
      url.hostname === "zhihu.com" || url.hostname.endsWith(".zhihu.com");
    return url.protocol === "https:" && isZhihuHost
      ? url.toString()
      : ZHIHU_RISK_CONTROL_URL;
  } catch {
    return ZHIHU_RISK_CONTROL_URL;
  }
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function parseJsonSafe(text: string): unknown {
  try {
    return parseJson(text);
  } catch {
    return {};
  }
}

function anonymousSnapshot(): ZhihuAuthSnapshot {
  return {
    phase: "anonymous",
    profile: null,
    qrDataUrl: null,
    expiresAt: null,
    message: null,
    riskControlUrl: null,
  };
}

export function emptyPersistedAuth(): PersistedZhihuAuth {
  return { cookies: {}, profile: null, verifiedAt: null };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
