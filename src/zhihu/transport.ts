import { requestUrl } from "obsidian";

export interface ZhihuTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ZhihuTransportResponse {
  readonly status: number;
  readonly text: string;
}

export interface ZhihuTransport {
  get(request: ZhihuTransportRequest): Promise<ZhihuTransportResponse>;
}

export class ObsidianZhihuTransport implements ZhihuTransport {
  async get(request: ZhihuTransportRequest): Promise<ZhihuTransportResponse> {
    const response = await requestUrl({
      url: request.url,
      method: "GET",
      headers: { ...request.headers },
      throw: false,
    });
    return { status: response.status, text: response.text };
  }
}
