import type { ZhihuAuthSnapshot } from "@/auth/types";

export function canUseZhihuNetwork(auth: ZhihuAuthSnapshot): boolean {
  return auth.phase === "authenticated";
}

export function zhihuLoginRequirementMessage(
  auth: ZhihuAuthSnapshot,
): string {
  switch (auth.phase) {
    case "expired":
      return "知乎登录已过期，请前往“设置 → Zhihu Reader”重新登录。";
    case "creating-qr":
    case "waiting-scan":
    case "waiting-confirm":
    case "verifying":
      return "知乎登录仍在进行中，请完成扫码确认后再使用阅读功能。";
    case "risk-control":
      return "知乎要求先完成安全验证，请前往“设置 → Zhihu Reader”继续登录。";
    case "error":
      return auth.message ??
        "知乎登录发生错误，请前往“设置 → Zhihu Reader”重试。";
    default:
      return "知乎当前要求登录后访问内容，请前往“设置 → Zhihu Reader”扫码登录。";
  }
}
