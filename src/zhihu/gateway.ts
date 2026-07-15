import type { AnswerDocument, AnswerPage } from "@/domain/zhihu";
import {
  parseAnswerResponse,
  parseQuestionFeedsResponse,
  ZhihuApiResponseError,
  ZhihuResponseValidationError,
} from "@/zhihu/schemas";
import type { ZhihuTransport } from "@/zhihu/transport";
import {
  buildAnswerUrl,
  buildQuestionFeedsUrl,
  type FetchQuestionAnswersOptions,
} from "@/zhihu/urls";

const ZHIHU_WEB_ORIGIN = "https://www.zhihu.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type ZhihuGatewayErrorKind =
  | "network"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "response";

export class ZhihuGatewayError extends Error {
  constructor(
    readonly kind: ZhihuGatewayErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ZhihuGatewayError";
  }
}

export interface ZhihuGateway {
  getAnswer(answerId: string): Promise<AnswerDocument>;
  getAnswerPage(
    questionId: string,
    options?: FetchQuestionAnswersOptions,
  ): Promise<AnswerPage>;
}

export interface HttpZhihuGatewayOptions {
  readonly cookie?: string;
  readonly userAgent?: string;
}

export class HttpZhihuGateway implements ZhihuGateway {
  private readonly cookie?: string;
  private readonly userAgent: string;

  constructor(
    private readonly transport: ZhihuTransport,
    options: HttpZhihuGatewayOptions = {},
  ) {
    this.cookie = options.cookie?.trim() || undefined;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async getAnswer(answerId: string): Promise<AnswerDocument> {
    const text = await this.request(buildAnswerUrl(answerId), ZHIHU_WEB_ORIGIN);
    try {
      return parseAnswerResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  async getAnswerPage(
    questionId: string,
    options: FetchQuestionAnswersOptions = {},
  ): Promise<AnswerPage> {
    const text = await this.request(
      buildQuestionFeedsUrl(questionId, options),
      `${ZHIHU_WEB_ORIGIN}/question/${questionId}`,
    );
    try {
      return parseQuestionFeedsResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  private async request(url: string, referer: string): Promise<string> {
    let response;
    try {
      response = await this.transport.get({
        url,
        headers: {
          Accept: "application/json",
          Referer: referer,
          "User-Agent": this.userAgent,
          ...(this.cookie === undefined ? {} : { Cookie: this.cookie }),
        },
      });
    } catch (error: unknown) {
      throw new ZhihuGatewayError(
        "network",
        "网络请求失败，请检查连接后重试。",
        { cause: error },
      );
    }

    switch (response.status) {
      case 403:
        throw new ZhihuGatewayError(
          "forbidden",
          "该回答暂时无法访问，登录后可能可以阅读。",
        );
      case 404:
        throw new ZhihuGatewayError(
          "not-found",
          "回答不存在、已删除或链接已失效。",
        );
      case 429:
        throw new ZhihuGatewayError(
          "rate-limited",
          "知乎请求过于频繁，请稍后重试。",
        );
      default:
        if (response.status < 200 || response.status >= 300) {
          throw new ZhihuGatewayError(
            "response",
            `知乎接口返回异常状态 ${response.status}。`,
          );
        }
    }
    return response.text;
  }
}

function responseError(error: unknown): ZhihuGatewayError {
  if (error instanceof ZhihuApiResponseError) {
    return new ZhihuGatewayError("response", error.message, { cause: error });
  }
  if (error instanceof ZhihuResponseValidationError) {
    return new ZhihuGatewayError(
      "response",
      "知乎返回的数据结构发生变化，暂时无法显示该回答。",
      { cause: error },
    );
  }
  return new ZhihuGatewayError(
    "response",
    "处理知乎响应时发生未知错误。",
    { cause: error },
  );
}
