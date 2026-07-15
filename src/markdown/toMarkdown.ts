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

  turndown.addRule("resolveZhihuImageSource", {
    filter: "img",
    replacement: (_content, node) => imageMarkdown(node),
  });

  return turndown.turndown(html).trim();
}

const ZHIHU_IMAGE_SOURCE_ATTRIBUTES = [
  "data-original",
  "data-default-watermark-src",
  "data-actualsrc",
  "data-thumbnail",
  "src",
] as const;

function imageMarkdown(node: HTMLElement): string {
  const source = resolveImageSource(node);
  if (source === null) {
    return "";
  }
  const alt = escapeMarkdownAttribute(node.getAttribute("alt") ?? "");
  const title = cleanAttribute(node.getAttribute("title"));
  const titlePart = title.length === 0 ? "" : ` "${title.replace(/"/gu, '\\"')}"`;
  return `![${alt}](${escapeLinkDestination(source)}${titlePart})`;
}

function resolveImageSource(node: HTMLElement): string | null {
  for (const attribute of ZHIHU_IMAGE_SOURCE_ATTRIBUTES) {
    const source = normalizeImageSource(node.getAttribute(attribute));
    if (source !== null) {
      return source;
    }
  }
  const originalToken = cleanAttribute(node.getAttribute("data-original-token"));
  if (/^v2-[\w-]+$/u.test(originalToken)) {
    return `https://pic1.zhimg.com/${originalToken}`;
  }
  return null;
}

function normalizeImageSource(value: string | null): string | null {
  const source = cleanAttribute(value);
  if (source.length === 0 || isSvgPlaceholder(source)) {
    return null;
  }
  if (/^data:image\/(?:gif|jpe?g|png|webp);base64,/iu.test(source)) {
    return source;
  }

  const absolute = source.startsWith("//") ? `https:${source}` : source;
  try {
    const url = new URL(absolute);
    return url.protocol === "https:" || url.protocol === "http:"
      ? absolute
      : null;
  } catch {
    return null;
  }
}

function isSvgPlaceholder(source: string): boolean {
  return /^data:image\/svg\+xml(?:;|,)/iu.test(source);
}

function cleanAttribute(value: string | null): string {
  return value?.trim().replace(/(\n+\s*)+/gu, "\n") ?? "";
}

function escapeMarkdownAttribute(value: string): string {
  return cleanAttribute(value)
    .replace(/\\/gu, "\\\\")
    .replace(/\[/gu, "\\[")
    .replace(/\]/gu, "\\]");
}

function escapeLinkDestination(value: string): string {
  const escaped = value.replace(/([<>()])/gu, "\\$1");
  return escaped.includes(" ") ? `<${escaped}>` : escaped;
}
