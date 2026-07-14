import { requestUrl } from "obsidian";

import type { AnswerPage } from "@/domain/zhihu";
import { parseQuestionFeedsResponse } from "@/zhihu/schemas";
import {
  buildQuestionFeedsUrl,
  type FetchQuestionAnswersOptions,
} from "@/zhihu/urls";

const ZHIHU_WEB_ORIGIN = "https://www.zhihu.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ZhihuClientOptions {
  cookie?: string;
  userAgent?: string;
}

export class ZhihuClient {
  private readonly cookie?: string;
  private readonly userAgent: string;

  constructor(options: ZhihuClientOptions = {}) {
    this.cookie = options.cookie?.trim() || undefined;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async fetchQuestionAnswers(
    questionId: string,
    options: FetchQuestionAnswersOptions = {},
  ): Promise<AnswerPage> {
    const response = await requestUrl({
      url: buildQuestionFeedsUrl(questionId, options),
      method: "GET",
      headers: {
        Accept: "application/json",
        Referer: `${ZHIHU_WEB_ORIGIN}/question/${questionId}`,
        "User-Agent": this.userAgent,
        ...(this.cookie === undefined ? {} : { Cookie: this.cookie }),
      },
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Zhihu API request failed with status ${response.status}.`);
    }

    return parseQuestionFeedsResponse(response.text);
  }
}
