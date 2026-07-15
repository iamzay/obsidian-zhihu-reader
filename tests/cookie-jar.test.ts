import { describe, expect, it } from "vitest";

import { CookieJar } from "@/auth/CookieJar";

describe("CookieJar", () => {
  it("accepts a Set-Cookie array returned by the Obsidian runtime", () => {
    const jar = new CookieJar();
    const runtimeHeaders = {
      "set-cookie": [
        "anonymous_context=ready; Path=/; HttpOnly",
        "_xsrf=fixture; Path=/; Secure",
      ],
    };

    jar.updateFromHeaders(runtimeHeaders);

    expect(jar.toRecord()).toEqual({
      anonymous_context: "ready",
      _xsrf: "fixture",
    });
  });
});
