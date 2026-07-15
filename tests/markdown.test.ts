import { readFileSync } from "node:fs";

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

  it("converts Zhihu rich content into Obsidian Markdown", () => {
    const markdown = zhihuHtmlToMarkdown(
      readFileSync(
        new URL("./fixtures/zhihu/rich-content.html", import.meta.url),
        "utf8",
      ),
    );

    expect(markdown).toContain("行内公式 $a^2+b^2$");
    expect(markdown).toContain("$x+y$");
    expect(markdown).toContain("~~旧结论~~、==重点==");
    expect(markdown).toContain("$$\nE=mc^2\n$$");
    expect(markdown).toContain("```ts\nconst value = 1;\n```");
    expect(markdown).toContain("| 名称 | 值 |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("参考[^1]");
    expect(markdown).toContain("[^1]: 参考资料 [来源](https://example.com/ref)");
    expect(markdown).toContain("![](https://pic.example/image.jpg)");
    expect(markdown).toContain("*图片说明*");
  });

  it("drops unsafe links and tracking controls", () => {
    const markdown = zhihuHtmlToMarkdown(
      `<p><a href="javascript:alert(1)">不安全链接</a><button>跟踪操作</button></p>`,
    );

    expect(markdown).toBe("不安全链接");
  });

  it("canonicalizes image query parameters and removes tracking case-insensitively", () => {
    const markdown = zhihuHtmlToMarkdown(
      `<img src="https://pic.example/image.jpg?z=2&amp;NeedBackground=1&amp;a=1&amp;UTM_Source=zhihu" />`,
    );

    expect(markdown).toBe(
      "![](https://pic.example/image.jpg?a=1&z=2)",
    );
  });

  it("creates a valid Markdown header for tables without th elements", () => {
    const markdown = zhihuHtmlToMarkdown(
      "<table><tbody><tr><td>名称</td><td>值</td></tr><tr><td>A</td><td>1</td></tr></tbody></table>",
    );

    expect(markdown).toContain("| 名称 | 值 |");
    expect(markdown).toContain("| --- | --- |");
  });
});
