import type { ZhihuTarget } from "@/domain/zhihu";

const SUPPORTED_HOSTS = new Set(["zhihu.com", "www.zhihu.com"]);
const QUESTION_PATH = /^\/question\/(\d+)\/?$/;
const ANSWER_PATH = /^\/question\/(\d+)\/answer\/(\d+)\/?$/;
const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/giu;

export class ZhihuTargetParseError extends Error {
  readonly code = "INVALID_ZHIHU_URL";

  constructor(message: string) {
    super(message);
    this.name = "ZhihuTargetParseError";
  }
}

export class ZhihuTargetParser {
  parse(input: string): ZhihuTarget {
    const value = input.trim();
    if (value.length === 0) {
      throw new ZhihuTargetParseError("请输入知乎问题或回答链接。");
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ZhihuTargetParseError("链接格式无效，请粘贴完整的知乎 URL。");
    }

    if (url.protocol !== "https:" || !SUPPORTED_HOSTS.has(url.hostname)) {
      throw new ZhihuTargetParseError("仅支持 zhihu.com 的问题或回答链接。");
    }

    const answerMatch = ANSWER_PATH.exec(url.pathname);
    if (answerMatch !== null) {
      const [, questionId, answerId] = answerMatch;
      if (questionId !== undefined && answerId !== undefined) {
        return { type: "answer", questionId, answerId };
      }
    }

    const questionMatch = QUESTION_PATH.exec(url.pathname);
    if (questionMatch?.[1] !== undefined) {
      return { type: "question", questionId: questionMatch[1] };
    }

    throw new ZhihuTargetParseError(
      "无法识别该链接，请使用知乎问题或回答页面 URL。",
    );
  }

  findFirst(input: string): { target: ZhihuTarget; url: string } | null {
    for (const match of input.matchAll(URL_CANDIDATE)) {
      const candidate = trimTrailingPunctuation(match[0]);
      try {
        return { target: this.parse(candidate), url: candidate };
      } catch {
        // Continue until the first supported Zhihu URL is found.
      }
    }
    return null;
  }
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;!?，。；！？）]+$/u, "");
}
