export interface ZhihuAuthProfile {
  readonly id: string;
  readonly name: string;
  readonly urlToken: string;
  readonly avatarUrl?: string;
}

export interface PersistedZhihuAuth {
  readonly cookies: Readonly<Record<string, string>>;
  readonly profile: ZhihuAuthProfile | null;
  readonly verifiedAt: number | null;
}

export type ZhihuAuthPhase =
  | "anonymous"
  | "verifying"
  | "creating-qr"
  | "waiting-web-login"
  | "waiting-scan"
  | "waiting-confirm"
  | "authenticated"
  | "expired"
  | "cancelled"
  | "risk-control"
  | "error";

export interface ZhihuAuthSnapshot {
  readonly phase: ZhihuAuthPhase;
  readonly profile: ZhihuAuthProfile | null;
  readonly qrDataUrl: string | null;
  readonly expiresAt: number | null;
  readonly message: string | null;
  readonly riskControlUrl: string | null;
}
