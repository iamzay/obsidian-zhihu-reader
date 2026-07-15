import { describe, expect, it } from "vitest";

import { zhihuHtmlToMarkdown } from "@/markdown/toMarkdown";

describe("zhihuHtmlToMarkdown", () => {
  it("converts answer HTML into Obsidian-friendly Markdown", () => {
    const markdown = zhihuHtmlToMarkdown(
      "<h2>结论</h2><p>一段<strong>重点</strong>。</p><script>ignored()</script>",
    );

    expect(markdown).toBe("## 结论\n\n一段**重点**。");
  });

  it("uses the real Zhihu image URL instead of its SVG loading placeholder", () => {
    const markdown = zhihuHtmlToMarkdown(
      `<p><img alt="流程图" src="data:image/svg+xml;utf8,&lt;svg xmlns='http://www.w3.org/2000/svg' width='810' height='110'&gt;&lt;/svg&gt;" data-original-token="v2-fixture" data-original="https://pic1.zhimg.com/v2-fixture_r.jpg" /></p>`,
    );

    expect(markdown).toBe(
      "![流程图](https://pic1.zhimg.com/v2-fixture_r.jpg)",
    );
  });

  it("supports data-actualsrc and protocol-relative Zhihu image URLs", () => {
    const markdown = zhihuHtmlToMarkdown(
      `<img src="data:image/svg+xml;utf8,&lt;svg&gt;&lt;/svg&gt;" data-actualsrc="//picx.zhimg.com/v2-fixture_b.jpg" />`,
    );

    expect(markdown).toBe("![](https://picx.zhimg.com/v2-fixture_b.jpg)");
  });

  it("removes an SVG loading placeholder when no real image URL exists", () => {
    const markdown = zhihuHtmlToMarkdown(
      `<p>图片前<img src="data:image/svg+xml;utf8,&lt;svg width='1' height='1'&gt;&lt;/svg&gt;" />图片后</p>`,
    );

    expect(markdown).toBe("图片前图片后");
  });

  it("keeps an ordinary remote image", () => {
    const markdown = zhihuHtmlToMarkdown(
      `<img alt="示例" src="https://pic1.zhimg.com/example.png" />`,
    );

    expect(markdown).toBe("![示例](https://pic1.zhimg.com/example.png)");
  });
});
