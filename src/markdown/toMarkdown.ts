import TurndownService from "turndown";

export function zhihuHtmlToMarkdown(html: string): string {
  const footnotes = new Map<string, string>();
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    headingStyle: "atx",
    blankReplacement: (_content, node) =>
      node.hasAttribute("data-tex") ? equationMarkdown(node) : "",
  });

  turndown.addRule("removeZhihuNoscript", {
    filter: ["noscript", "script", "style", "iframe", "button"],
    replacement: () => "",
  });

  turndown.addRule("resolveZhihuImageSource", {
    filter: "img",
    replacement: (_content, node) => imageMarkdown(node),
  });

  turndown.addRule("zhihuFigure", {
    filter: (node) =>
      node.nodeName === "FIGURE" && node.querySelector("img") !== null,
    replacement: (_content, node) => {
      const image = node.querySelector("img");
      if (image === null) {
        return "";
      }
      const markdown = imageMarkdown(image);
      const caption = cleanAttribute(
        node.querySelector("figcaption")?.textContent ??
          image.getAttribute("data-caption") ??
          "",
      );
      return caption.length === 0
        ? `\n\n${markdown}\n\n`
        : `\n\n${markdown}\n\n*${escapeMarkdownAttribute(caption)}*\n\n`;
    },
  });

  turndown.addRule("zhihuEquation", {
    filter: (node) =>
      (node.nodeName === "IMG" || node.hasAttribute("data-tex")) &&
      equationTex(node) !== null,
    replacement: (_content, node) => {
      return equationMarkdown(node);
    },
  });

  turndown.addRule("zhihuCodeBlock", {
    filter: "pre",
    replacement: (_content, node) => {
      const code = node.querySelector("code") ?? node;
      const language = (code.getAttribute("class") ?? "")
        .split(/\s+/u)
        .map((name) => /^(?:language|lang)-([\w+-]+)$/u.exec(name)?.[1])
        .find((value) => value !== undefined) ?? "";
      const value = (code.textContent ?? "").replace(/\n$/u, "");
      const longestFence = Math.max(
        3,
        ...[...value.matchAll(/`+/gu)].map(([ticks]) => ticks.length + 1),
      );
      const fence = "`".repeat(longestFence);
      return `\n\n${fence}${language}\n${value}\n${fence}\n\n`;
    },
  });

  turndown.addRule("zhihuTableCell", {
    filter: ["th", "td"],
    replacement: (content) =>
      ` ${content.trim().replace(/\|/gu, "\\|").replace(/\n+/gu, " ")} |`,
  });

  turndown.addRule("zhihuTableRow", {
    filter: "tr",
    replacement: (content, node) => {
      const row = `|${content}\n`;
      let isHeader = node.parentElement?.nodeName === "THEAD";
      for (let index = 0; index < node.childNodes.length; index += 1) {
        if (node.childNodes.item(index)?.nodeName === "TH") {
          isHeader = true;
        }
      }
      const cells = node.querySelectorAll("th, td").length;
      return isHeader ? `${row}|${" --- |".repeat(cells)}\n` : row;
    },
  });

  turndown.addRule("zhihuTable", {
    filter: "table",
    replacement: (content) => {
      const rows = content.trim().split("\n");
      if (rows.length > 0 && !isMarkdownTableSeparator(rows[1] ?? "")) {
        const firstRow = rows[0] ?? "";
        const unescaped = firstRow.replace(/\\\|/gu, "");
        const columns = Math.max(1, (unescaped.match(/\|/gu)?.length ?? 1) - 1);
        rows.splice(1, 0, `|${" --- |".repeat(columns)}`);
      }
      return `\n\n${rows.join("\n")}\n\n`;
    },
  });

  turndown.addRule("zhihuFootnote", {
    filter: (node) =>
      node.nodeName === "SUP" &&
      node.getAttribute("data-draft-type") === "reference" &&
      /^\d+$/u.test(node.getAttribute("data-numero") ?? ""),
    replacement: (_content, node) => {
      const number = node.getAttribute("data-numero") ?? "";
      const text = escapeMarkdownAttribute(
        cleanAttribute(node.getAttribute("data-text")),
      );
      const url = safeLinkDestination(node.getAttribute("data-url"));
      const definition = [text, url === null ? "" : `[来源](${url})`]
        .filter((value) => value.length > 0)
        .join(" ");
      footnotes.set(number, definition || `脚注 ${number}`);
      return `[^${number}]`;
    },
  });

  turndown.addRule("safeLink", {
    filter: "a",
    replacement: (content, node) => {
      const destination = safeLinkDestination(node.getAttribute("href"));
      if (destination === null || content.trim().length === 0) {
        return content;
      }
      return `[${content}](${escapeLinkDestination(destination)})`;
    },
  });

  turndown.addRule("highlight", {
    filter: "mark",
    replacement: (content) => `==${content}==`,
  });

  turndown.addRule("strikethrough", {
    filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
    replacement: (content) => `~~${content}~~`,
  });

  const markdown = turndown.turndown(html).trim();
  const definitions = [...footnotes.entries()]
    .map(([number, definition]) => `[^${number}]: ${definition}`)
    .join("\n");
  return definitions.length === 0 ? markdown : `${markdown}\n\n${definitions}`;
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
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    removeTrackingParameters(url);
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function equationTex(node: HTMLElement): string | null {
  const direct = cleanAttribute(node.getAttribute("data-tex"));
  if (direct.length > 0) {
    return direct;
  }
  const source = node.getAttribute("src");
  if (source === null || !source.includes("/equation?")) {
    return null;
  }
  try {
    return new URL(source, "https://www.zhihu.com").searchParams.get("tex");
  } catch {
    return cleanAttribute(node.getAttribute("alt")) || null;
  }
}

function equationMarkdown(node: HTMLElement): string {
  const tex = equationTex(node);
  if (tex === null) {
    return "";
  }
  const isBlock =
    node.getAttribute("eeimg") === "2" ||
    node.classList.contains("math-display");
  return isBlock ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
}

function safeLinkDestination(value: string | null): string | null {
  const source = cleanAttribute(value);
  if (source.startsWith("#") && /^#[\w-]+$/u.test(source)) {
    return source;
  }
  if (source.length === 0) {
    return null;
  }
  const absolute = source.startsWith("//") ? `https:${source}` : source;
  try {
    const url = new URL(absolute);
    if (url.hostname === "link.zhihu.com") {
      const target = url.searchParams.get("target");
      return target === null ? null : safeLinkDestination(target);
    }
    if (!["https:", "http:", "mailto:"].includes(url.protocol)) {
      return null;
    }
    removeTrackingParameters(url);
    return url.toString();
  } catch {
    return null;
  }
}

function removeTrackingParameters(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.startsWith("utm_") ||
      ["source", "needbackground", "from", "tracking_id"].includes(
        normalizedKey,
      )
    ) {
      url.searchParams.delete(key);
    }
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
    .replace(/[[\]*_~]/gu, "\\$&");
}

function escapeLinkDestination(value: string): string {
  const escaped = value.replace(/([<>()])/gu, "\\$1");
  return escaped.includes(" ") ? `<${escaped}>` : escaped;
}

function isMarkdownTableSeparator(row: string): boolean {
  return /^\|(?:\s*:?-{3,}:?\s*\|)+$/u.test(row);
}
