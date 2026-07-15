import { describe, expect, it } from "vitest";

import { createZse96Header, md5Hex } from "@/zhihu/fetchSignature";

describe("Zhihu fetch signature", () => {
  it.each([
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["hello", "5d41402abc4b2a76b9719d911017c592"],
  ])("matches the MD5 vector for %j", (input, expected) => {
    expect(md5Hex(input)).toBe(expected);
  });

  it("binds the signature to the complete request path and d_c0", () => {
    const first = createZse96Header(
      "https://www.zhihu.com/api/v4/answers/123?include=content",
      "device-token",
    );
    const same = createZse96Header(
      "https://www.zhihu.com/api/v4/answers/123?include=content",
      "device-token",
    );
    const differentPath = createZse96Header(
      "https://www.zhihu.com/api/v4/answers/124?include=content",
      "device-token",
    );

    expect(first).toMatch(/^2\.0_/u);
    expect(first).toBe(
      "2.0_jayoIvvXF80Q=mFpqLSW37td=VMlqCgokKzw/Iz6ITRRU+JsiC1=O22kBIpZtW8/",
    );
    expect(same).toBe(first);
    expect(differentPath).not.toBe(first);
  });
});
