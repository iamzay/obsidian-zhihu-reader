import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HttpZhihuGateway, ZhihuGatewayError } from "@/zhihu/gateway";
import { createZse96Header } from "@/zhihu/fetchSignature";
import { FixtureZhihuTransport } from "./support/FixtureZhihuTransport";

function fixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/zhihu/${name}`, import.meta.url),
    "utf8",
  );
}

describe("HttpZhihuGateway", () => {
  it("loads the complete question summary", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("question.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);

    const question = await gateway.getQuestion("123456789");

    expect(question).toMatchObject({
      id: "123456789",
      title: "如何在 Obsidian 中建立阅读工作流？",
      answerCount: 18,
      followerCount: 204,
    });
    expect(transport.requests[0]?.url).toContain(
      "/api/v4/questions/123456789?include=",
    );
  });

  it("loads a direct answer through the transport seam", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("answer.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);

    const answer = await gateway.getAnswer("90071992547409931234");

    expect(answer.id).toBe("90071992547409931234");
    expect(answer.question.title).toBe("如何在 Obsidian 中建立阅读工作流？");
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toContain(
      "/api/v4/answers/90071992547409931234?include=",
    );
  });

  it("posts an authenticated answer vote with a body-bound signature", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: '{"voteup_count":129}',
    }));
    const gateway = new HttpZhihuGateway(transport, {
      getCookieHeader: () =>
        'z_c0=fixture-session; d_c0="fixture-device-token"',
    });

    const result = await gateway.setAnswerVote("123", true);

    expect(result).toEqual({ isVoted: true, voteupCount: 129 });
    expect(transport.requests[0]).toMatchObject({
      url: "https://www.zhihu.com/api/v4/answers/123/voters",
      method: "POST",
      body: '{"type":"up"}',
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.zhihu.com",
      },
    });
    expect(transport.requests[0]?.headers["x-zse-96"]).toBe(
      createZse96Header(
        "https://www.zhihu.com/api/v4/answers/123/voters",
        "fixture-device-token",
        '{"type":"up"}',
      ),
    );
  });

  it("uses neutral to cancel a vote", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: '{"voteup_count":128}',
    }));
    const gateway = new HttpZhihuGateway(transport, {
      getCookieHeader: () => "z_c0=fixture-session",
    });

    await gateway.setAnswerVote("123", false);

    expect(transport.requests[0]?.body).toBe('{"type":"neutral"}');
  });

  it("rejects an anonymous vote before sending a request", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: '{"voteup_count":129}',
    }));
    const gateway = new HttpZhihuGateway(transport);

    await expect(gateway.setAnswerVote("123", true)).rejects.toMatchObject({
      kind: "forbidden",
      message: "请先在 Zhihu Reader 设置中登录知乎，再点赞回答。",
    });
    expect(transport.requests).toHaveLength(0);
  });

  it("loads an author's answer page through the authenticated gateway", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("member-answers.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);

    const page = await gateway.getAuthorAnswerPage("fixture-author");

    expect(page.answers).toHaveLength(2);
    expect(page.answers[0]?.answerId).toBe("90071992547409931234");
    expect(transport.requests[0]?.url).toContain(
      "/api/v4/members/fixture-author/answers?sort_by=created",
    );
    expect(transport.requests[0]?.headers.Referer).toBe(
      "https://www.zhihu.com/people/fixture-author/answers",
    );
  });

  it("loads root and child comments through validated endpoints", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("comments.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);

    const roots = await gateway.getAnswerCommentPage(
      "90071992547409931234",
      { order: "time" },
    );
    const replies = await gateway.getChildCommentPage(
      "90071992547409939999",
    );

    expect(roots.comments).toHaveLength(2);
    expect(replies.comments[0]?.author.name).toBe("评论作者");
    expect(transport.requests[0]?.url).toContain(
      "/api/v4/comment_v5/answers/90071992547409931234/root_comment?order_by=ts",
    );
    expect(transport.requests[0]?.headers.Referer).toBe(
      "https://www.zhihu.com/answer/90071992547409931234",
    );
    expect(transport.requests[1]?.url).toContain(
      "/api/v4/comment_v5/comment/90071992547409939999/child_comment",
    );
  });

  it("loads answer search results through the authenticated gateway", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("search-answers.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);

    const page = await gateway.getSearchAnswerPage("Obsidian");

    expect(page.results).toHaveLength(2);
    const request = new URL(transport.requests[0]?.url ?? "");
    expect(request.pathname).toBe("/api/v4/search_v3");
    expect(request.searchParams.get("vertical")).toBe("answer");
    expect(transport.requests[0]?.headers.Referer).toBe(
      "https://www.zhihu.com/search?q=Obsidian&type=content",
    );
  });

  it("loads the daily hot list through the authenticated transport seam", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("hot-list.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);

    const items = await gateway.getHotList();

    expect(items.map(({ questionId }) => questionId)).toEqual([
      "1993016651038364760",
      "123456789",
    ]);
    expect(transport.requests[0]?.url).toBe(
      "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&mobile=true",
    );
    expect(transport.requests[0]?.headers.Referer).toBe(
      "https://www.zhihu.com/hot",
    );
  });

  it("classifies a hot-list authentication response as forbidden", async () => {
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => ({
        status: 200,
        text: JSON.stringify({
          error: { code: 101, message: "身份未经过验证" },
        }),
      })),
    );

    await expect(gateway.getHotList()).rejects.toMatchObject({
      kind: "forbidden",
      message: "身份未经过验证",
    });
  });

  it.each([
    [403, "forbidden"],
    [404, "not-found"],
    [429, "rate-limited"],
  ] as const)("maps status %s to %s", async (status, kind) => {
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => ({ status, text: "" })),
    );

    const request = gateway.getAnswer("123");
    await expect(request).rejects.toBeInstanceOf(ZhihuGatewayError);
    await expect(request).rejects.toMatchObject({ kind });
  });

  it("notifies the auth session when Zhihu rejects the current login", async () => {
    const messages: string[] = [];
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => ({
        status: 401,
        text: JSON.stringify({
          error: { code: 101, message: "ZERR_NOT_LOGIN" },
        }),
      })),
      {
        getCookieHeader: () => "z_c0=expired-session",
        onAuthenticationRequired: (message) => messages.push(message),
      },
    );

    await expect(gateway.getAnswer("123")).rejects.toMatchObject({
      kind: "forbidden",
    });
    expect(messages).toEqual([
      "知乎登录已失效，请前往“设置 → Zhihu Reader”重新登录。",
    ]);
  });

  it("maps schema changes to a recoverable response error", async () => {
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => ({
        status: 200,
        text: '{"type":"answer","id":"123"}',
      })),
    );

    await expect(gateway.getAnswer("123")).rejects.toMatchObject({
      kind: "response",
    });
  });

  it("maps transport failures to a network error", async () => {
    const gateway = new HttpZhihuGateway(
      new FixtureZhihuTransport(() => {
        throw new Error("offline");
      }),
    );

    await expect(gateway.getAnswer("123")).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("reads the current authenticated cookie for every request", async () => {
    const auth = { cookie: undefined as string | undefined };
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("answer.json"),
    }));
    const gateway = new HttpZhihuGateway(transport, {
      getCookieHeader: () => auth.cookie,
    });

    await gateway.getAnswer("123");
    auth.cookie = "session_cookie=fixture";
    await gateway.getAnswer("124");

    expect(transport.requests[0]?.headers.Cookie).toBeUndefined();
    expect(transport.requests[1]?.headers.Cookie).toBe(
      "session_cookie=fixture",
    );
  });

  it("signs authenticated requests when the session contains d_c0", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("answer.json"),
    }));
    const gateway = new HttpZhihuGateway(transport, {
      getCookieHeader: () =>
        'z_c0=fixture-session; d_c0="fixture-device-token"',
    });

    await gateway.getAnswer("123");

    expect(transport.requests[0]?.headers).toMatchObject({
      "x-zse-93": "101_3_3.0",
      "x-requested-with": "fetch",
    });
    expect(transport.requests[0]?.headers["x-zse-96"]).toMatch(/^2\.0_/u);
    expect(transport.requests[0]?.headers["User-Agent"]).toContain(
      "Chrome/145.0.0.0",
    );
  });

  it("follows the validated paging.next URL", async () => {
    const transport = new FixtureZhihuTransport(() => ({
      status: 200,
      text: fixture("question-feeds.json"),
    }));
    const gateway = new HttpZhihuGateway(transport);
    const next =
      "https://www.zhihu.com/api/v4/questions/123456789/feeds?limit=6&offset=6";

    await gateway.getAnswerPage("123456789", { pageUrl: next });

    const requestedUrl = new URL(transport.requests[0]?.url ?? "");
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://www.zhihu.com/api/v4/questions/123456789/feeds",
    );
    expect(requestedUrl.searchParams.get("offset")).toBe("6");
    expect(requestedUrl.searchParams.get("include")).toContain(
      "data[*].content",
    );
  });
});
