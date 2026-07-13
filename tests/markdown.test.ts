import { describe, expect, it } from "vitest";

import { zhihuHtmlToMarkdown } from "@/markdown/toMarkdown";

describe("zhihuHtmlToMarkdown", () => {
  it("converts answer HTML into Obsidian-friendly Markdown", () => {
    const markdown = zhihuHtmlToMarkdown(
      "<h2>结论</h2><p>一段<strong>重点</strong>。</p><script>ignored()</script>",
    );

    expect(markdown).toBe("## 结论\n\n一段**重点**。");
  });
});
