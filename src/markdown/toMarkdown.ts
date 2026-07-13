import TurndownService from "turndown";

export function zhihuHtmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
  });

  turndown.addRule("removeZhihuNoscript", {
    filter: ["noscript", "script", "style"],
    replacement: () => "",
  });

  return turndown.turndown(html).trim();
}
