import { requestUrl } from "obsidian";

export interface ZhihuTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly method?: "GET" | "POST";
  readonly body?: string;
}

export interface ZhihuTransportResponse {
  readonly status: number;
  readonly text: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ZhihuTransport {
  request(request: ZhihuTransportRequest): Promise<ZhihuTransportResponse>;
}

export class ObsidianZhihuTransport implements ZhihuTransport {
  async request(
    request: ZhihuTransportRequest,
  ): Promise<ZhihuTransportResponse> {
    const response = await requestUrl({
      url: request.url,
      method: request.method ?? "GET",
      headers: { ...request.headers },
      ...(request.body === undefined ? {} : { body: request.body }),
      throw: false,
    });
    return {
      status: response.status,
      text: response.text,
      headers: response.headers,
    };
  }
}
