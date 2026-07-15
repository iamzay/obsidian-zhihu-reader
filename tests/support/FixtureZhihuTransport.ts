import type {
  ZhihuTransport,
  ZhihuTransportRequest,
  ZhihuTransportResponse,
} from "@/zhihu/transport";

export interface FixtureZhihuTransportResponse {
  readonly status: number;
  readonly text: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export class FixtureZhihuTransport implements ZhihuTransport {
  readonly requests: ZhihuTransportRequest[] = [];

  constructor(
    private readonly respond: (
      request: ZhihuTransportRequest,
    ) =>
      | FixtureZhihuTransportResponse
      | Promise<FixtureZhihuTransportResponse>,
  ) {}

  async request(
    request: ZhihuTransportRequest,
  ): Promise<ZhihuTransportResponse> {
    this.requests.push(request);
    const response = await this.respond(request);
    return { ...response, headers: response.headers ?? {} };
  }
}
