import type {
  AnswerDocument,
  AnswerPage,
  AuthorAnswerPage,
  CommentPage,
  QuestionSummary,
  SearchAnswerPage,
  ZhihuHotListItem,
} from "@/domain/zhihu";
import {
  parseAnswerResponse,
  parseAuthorAnswersResponse,
  parseCommentsResponse,
  parseHotListResponse,
  parseQuestionResponse,
  parseQuestionFeedsResponse,
  parseSearchAnswersResponse,
  ZhihuApiResponseError,
  ZhihuResponseValidationError,
} from "@/zhihu/schemas";
import type { ZhihuTransport } from "@/zhihu/transport";
import {
  authenticatedFetchHeaders,
  ZHIHU_DESKTOP_USER_AGENT,
} from "@/zhihu/fetchSignature";
import {
  buildAnswerUrl,
  buildAnswerCommentsUrl,
  buildAuthorAnswersUrl,
  buildChildCommentsUrl,
  buildHotListUrl,
  buildQuestionFeedsUrl,
  buildQuestionUrl,
  buildSearchAnswersUrl,
  type FetchQuestionAnswersOptions,
  type FetchAuthorAnswersOptions,
  type FetchAnswerCommentsOptions,
  type FetchChildCommentsOptions,
  type FetchSearchAnswersOptions,
} from "@/zhihu/urls";

const ZHIHU_WEB_ORIGIN = "https://www.zhihu.com";

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
  getQuestion(questionId: string): Promise<QuestionSummary>;
  getAnswer(answerId: string): Promise<AnswerDocument>;
  getAnswerCommentPage(
    answerId: string,
    options?: FetchAnswerCommentsOptions,
  ): Promise<CommentPage>;
  getChildCommentPage(
    commentId: string,
    options?: FetchChildCommentsOptions,
  ): Promise<CommentPage>;
  getSearchAnswerPage(
    query: string,
    options?: FetchSearchAnswersOptions,
  ): Promise<SearchAnswerPage>;
  getAuthorAnswerPage(
    authorIdentifier: string,
    options?: FetchAuthorAnswersOptions,
  ): Promise<AuthorAnswerPage>;
  getHotList(limit?: number): Promise<readonly ZhihuHotListItem[]>;
  getAnswerPage(
    questionId: string,
    options?: FetchQuestionAnswersOptions,
  ): Promise<AnswerPage>;
}

export interface HttpZhihuGatewayOptions {
  readonly getCookieHeader?: () => string | undefined;
  readonly userAgent?: string;
}

export class HttpZhihuGateway implements ZhihuGateway {
  private readonly getCookieHeader: () => string | undefined;
  private readonly userAgent: string;

  constructor(
    private readonly transport: ZhihuTransport,
    options: HttpZhihuGatewayOptions = {},
  ) {
    this.getCookieHeader = options.getCookieHeader ?? (() => undefined);
    this.userAgent = options.userAgent ?? ZHIHU_DESKTOP_USER_AGENT;
  }

  async getQuestion(questionId: string): Promise<QuestionSummary> {
    const text = await this.request(
      buildQuestionUrl(questionId),
      `${ZHIHU_WEB_ORIGIN}/question/${questionId}`,
    );
    try {
      return parseQuestionResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  async getAnswer(answerId: string): Promise<AnswerDocument> {
    const text = await this.request(buildAnswerUrl(answerId), ZHIHU_WEB_ORIGIN);
    try {
      return parseAnswerResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  async getAnswerCommentPage(
    answerId: string,
    options: FetchAnswerCommentsOptions = {},
  ): Promise<CommentPage> {
    const text = await this.request(
      buildAnswerCommentsUrl(answerId, options),
      `${ZHIHU_WEB_ORIGIN}/answer/${answerId}`,
    );
    try {
      return parseCommentsResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  async getChildCommentPage(
    commentId: string,
    options: FetchChildCommentsOptions = {},
  ): Promise<CommentPage> {
    const text = await this.request(
      buildChildCommentsUrl(commentId, options),
      ZHIHU_WEB_ORIGIN,
    );
    try {
      return parseCommentsResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  async getSearchAnswerPage(
    query: string,
    options: FetchSearchAnswersOptions = {},
  ): Promise<SearchAnswerPage> {
    const text = await this.request(
      buildSearchAnswersUrl(query, options),
      `${ZHIHU_WEB_ORIGIN}/search?q=${encodeURIComponent(query)}&type=content`,
    );
    try {
      return parseSearchAnswersResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  async getHotList(limit = 50): Promise<readonly ZhihuHotListItem[]> {
    const text = await this.request(
      buildHotListUrl(limit),
      `${ZHIHU_WEB_ORIGIN}/hot`,
    );
    try {
      return parseHotListResponse(text);
    } catch (error: unknown) {
      throw responseError(error);
    }
  }

  async getAuthorAnswerPage(
    authorIdentifier: string,
    options: FetchAuthorAnswersOptions = {},
  ): Promise<AuthorAnswerPage> {
    const text = await this.request(
      buildAuthorAnswersUrl(authorIdentifier, options),
      `${ZHIHU_WEB_ORIGIN}/people/${encodeURIComponent(authorIdentifier)}/answers`,
    );
    try {
      return parseAuthorAnswersResponse(text);
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
      const cookie = this.getCookieHeader();
      response = await this.transport.request({
        url,
        headers: {
          Accept: "application/json",
          Referer: referer,
          "User-Agent": this.userAgent,
          ...(cookie === undefined ? {} : { Cookie: cookie }),
          ...(cookie === undefined
            ? {}
            : authenticatedFetchHeaders(url, cookie)),
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
          "该内容暂时无法访问，登录后可能可以阅读。",
        );
      case 404:
        throw new ZhihuGatewayError(
          "not-found",
          "内容不存在、已删除或链接已失效。",
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
    return new ZhihuGatewayError(
      error.code === "101" ? "forbidden" : "response",
      error.message,
      { cause: error },
    );
  }
  if (error instanceof ZhihuResponseValidationError) {
    return new ZhihuGatewayError(
      "response",
      "知乎返回的数据结构发生变化，暂时无法显示该内容。",
      { cause: error },
    );
  }
  return new ZhihuGatewayError(
    "response",
    "处理知乎响应时发生未知错误。",
    { cause: error },
  );
}
