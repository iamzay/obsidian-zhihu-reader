import type {
  ZhihuTransport,
  ZhihuTransportRequest,
  ZhihuTransportResponse,
} from "@/zhihu/transport";

export class FixtureZhihuTransport implements ZhihuTransport {
  readonly requests: ZhihuTransportRequest[] = [];

  constructor(
    private readonly respond: (
      request: ZhihuTransportRequest,
    ) => ZhihuTransportResponse | Promise<ZhihuTransportResponse>,
  ) {}

  async get(request: ZhihuTransportRequest): Promise<ZhihuTransportResponse> {
    this.requests.push(request);
    return await this.respond(request);
  }
}
