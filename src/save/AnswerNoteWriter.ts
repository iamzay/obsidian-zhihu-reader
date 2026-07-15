import type { AnswerDocument } from "@/domain/zhihu";
import { zhihuHtmlToMarkdown } from "@/markdown/toMarkdown";

export type ImageSaveMode = "remote" | "vault";
export type AttachmentLocation = "obsidian" | "custom";

export interface AnswerNoteSaveOptions {
  readonly saveFolder: string;
  readonly notePathTemplate: string;
  readonly imageMode: ImageSaveMode;
  readonly attachmentLocation: AttachmentLocation;
  readonly attachmentFolder: string;
  readonly overwritePath?: string;
}

export type AnswerNoteSaveResult =
  | { readonly status: "conflict"; readonly path: string }
  | {
      readonly status: "saved";
      readonly path: string;
      readonly warnings: readonly string[];
    };

export interface AnswerNoteStorage {
  findNoteByAnswerId(answerId: string): Promise<string | null>;
  fileExists(path: string): Promise<boolean>;
  findFileByStem(stem: string): Promise<string | null>;
  resolveAttachmentPath(
    filename: string,
    notePath: string,
    location: AttachmentLocation,
    customFolder: string,
  ): Promise<string>;
  writeText(path: string, content: string, overwrite: boolean): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
}

export interface DownloadedMedia {
  readonly data: ArrayBuffer;
  readonly contentType?: string;
}

export interface MediaDownloader {
  download(url: string): Promise<DownloadedMedia>;
}

export class AnswerNoteWriter {
  constructor(
    private readonly storage: AnswerNoteStorage,
    private readonly downloader: MediaDownloader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async save(
    answer: AnswerDocument,
    options: AnswerNoteSaveOptions,
  ): Promise<AnswerNoteSaveResult> {
    const existingPath = await this.storage.findNoteByAnswerId(answer.id);
    if (existingPath !== null && options.overwritePath !== existingPath) {
      return { status: "conflict", path: existingPath };
    }
    if (
      options.overwritePath !== undefined &&
      (existingPath === null || options.overwritePath !== existingPath)
    ) {
      throw new Error("待覆盖的回答笔记已发生变化，请重新保存。");
    }

    const path =
      existingPath ??
      (await this.availableNotePath(answer, options.saveFolder, options.notePathTemplate));
    let body = zhihuHtmlToMarkdown(answer.contentHtml);
    const warnings: string[] = [];
    if (options.imageMode === "vault") {
      const localized = await this.localizeImages(body, path, options, answer);
      body = localized.markdown;
      warnings.push(...localized.warnings);
    }
    const note = buildAnswerNote(answer, body, this.now());
    await this.storage.writeText(path, note, existingPath !== null);
    return { status: "saved", path, warnings };
  }

  private async availableNotePath(
    answer: AnswerDocument,
    saveFolder: string,
    template: string,
  ): Promise<string> {
    const relative = renderNotePath(template, answer);
    const folder = safeFolderPath(saveFolder);
    const requested = [folder, relative].filter(Boolean).join("/");
    if (!(await this.storage.fileExists(requested))) {
      return requested;
    }
    const withAnswerId = appendStableSuffix(requested, answer.id);
    if (!(await this.storage.fileExists(withAnswerId))) {
      return withAnswerId;
    }
    const hashed = appendStableSuffix(
      requested,
      `${answer.id}-${stableHash(answer.url)}`,
    );
    if (!(await this.storage.fileExists(hashed))) {
      return hashed;
    }
    for (let suffix = 2; suffix < 10_000; suffix += 1) {
      const candidate = appendStableSuffix(
        requested,
        `${answer.id}-${stableHash(answer.url)}-${suffix}`,
      );
      if (!(await this.storage.fileExists(candidate))) {
        return candidate;
      }
    }
    throw new Error("无法为回答笔记生成可用路径。");
  }

  private async localizeImages(
    markdown: string,
    notePath: string,
    options: AnswerNoteSaveOptions,
    answer: AnswerDocument,
  ): Promise<{ markdown: string; warnings: readonly string[] }> {
    const pattern = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gu;
    const matches = [...markdown.matchAll(pattern)];
    if (matches.length === 0) {
      return { markdown, warnings: [] };
    }

    const warnings: string[] = [];
    let output = "";
    let cursor = 0;
    const resolved = new Map<string, string>();
    for (const match of matches) {
      const original = match[0];
      const alt = match[1] ?? "";
      const url = match[2];
      const index = match.index;
      if (url === undefined || index === undefined) {
        continue;
      }
      output += markdown.slice(cursor, index);
      try {
        const cached = resolved.get(url);
        const attachmentPath =
          cached ??
          (await this.downloadImage(url, notePath, options, answer));
        resolved.set(url, attachmentPath);
        const alias = alt.length === 0 ? "" : `|${alt.replace(/\|/gu, "\\|")}`;
        output += `![[${attachmentPath}${alias}]]`;
      } catch (error: unknown) {
        output += original;
        warnings.push(`${url}：${errorMessage(error)}`);
      }
      cursor = index + original.length;
    }
    output += markdown.slice(cursor);
    return { markdown: output, warnings };
  }

  private async downloadImage(
    url: string,
    notePath: string,
    options: AnswerNoteSaveOptions,
    answer: AnswerDocument,
  ): Promise<string> {
    const parsed = new URL(url);
    const hash = stableHash(parsed.toString());
    const basename = sanitizePathSegment(
      decodeURIComponent(parsed.pathname.split("/").at(-1) ?? "image")
        .replace(/\.[a-z0-9]{1,8}$/iu, "") || "image",
    );
    const stem = `${basename}-${hash}`;
    const existing = await this.storage.findFileByStem(stem);
    if (existing !== null) {
      return existing;
    }

    const downloaded = await this.downloader.download(parsed.toString());
    const extension = imageExtension(parsed.pathname, downloaded.contentType);
    const filename = `${stem}.${extension}`;
    const path = await this.storage.resolveAttachmentPath(
      filename,
      notePath,
      options.attachmentLocation,
      renderFolderPath(options.attachmentFolder, answer),
    );
    await this.storage.writeBinary(path, downloaded.data);
    return path;
  }
}

export function buildAnswerNote(
  answer: AnswerDocument,
  markdown: string,
  createdAt: Date,
): string {
  const profileUrl = safeHttpUrl(answer.author.profileUrl);
  const author = profileUrl !== null
    ? `[${escapeMarkdown(answer.author.name)}](${escapeLinkDestination(profileUrl)})`
    : escapeMarkdown(answer.author.name);
  const sourceCreatedAt = new Date(
    (answer.createdTime ?? Math.floor(createdAt.getTime() / 1000)) * 1000,
  ).toISOString().slice(0, 10);
  return [
    "---",
    "type: zhihu-answer",
    `zhihu_answer_id: ${yamlString(answer.id)}`,
    `zhihu_question_id: ${yamlString(answer.question.id)}`,
    `question: ${yamlString(answer.question.title)}`,
    `author: ${yamlString(answer.author.name)}`,
    `source: ${yamlString(answer.url)}`,
    `created_at: ${yamlString(sourceCreatedAt)}`,
    "---",
    "",
    `# ${escapeMarkdown(answer.question.title.replace(/\s+/gu, " ").trim())}`,
    "",
    "> [!info] 回答信息",
    `> 作者：${author} · ${answer.voteupCount} 赞同`,
    `> [查看知乎原文](${answer.url})`,
    "",
    markdown,
    "",
    "## 我的笔记",
    "",
  ].join("\n");
}

export function renderNotePath(
  template: string,
  answer: AnswerDocument,
): string {
  const rendered = applyPathTemplate(template, answer);
  const segments = rendered
    .replace(/\\/gu, "/")
    .split("/")
    .map(sanitizePathSegment)
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    segments.push(`${sanitizePathSegment(answer.author.name)} - ${answer.id}`);
  }
  const last = segments.at(-1) ?? answer.id;
  segments[segments.length - 1] = last.toLowerCase().endsWith(".md")
    ? last
    : `${last}.md`;
  return segments.join("/");
}

export function renderFolderPath(
  template: string,
  answer: AnswerDocument,
): string {
  return safeFolderPath(applyPathTemplate(template, answer));
}

function applyPathTemplate(template: string, answer: AnswerDocument): string {
  const replacements: Readonly<Record<string, string>> = {
    "{问题标题}": sanitizePathSegment(answer.question.title),
    "{作者名}": sanitizePathSegment(answer.author.name),
    "{回答ID}": answer.id,
    "{问题ID}": answer.question.id,
  };
  let rendered = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(placeholder, value);
  }
  return rendered;
}

export function safeFolderPath(path: string): string {
  return path
    .replace(/\\/gu, "/")
    .split("/")
    .map(sanitizePathSegment)
    .filter((segment) => segment.length > 0)
    .join("/");
}

function sanitizePathSegment(value: string): string {
  const withoutControlCharacters = [...value]
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("");
  const sanitized = withoutControlCharacters
    .replace(/[\\/:*?"<>|]/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^[.\s]+|[.\s]+$/gu, "")
    .trim();
  if (sanitized === "" || sanitized === "." || sanitized === "..") {
    return "未命名";
  }
  return sanitized.slice(0, 120);
}

function appendStableSuffix(path: string, suffix: string): string {
  return path.replace(/\.md$/iu, `-${suffix}.md`);
}

function imageExtension(pathname: string, contentType?: string): string {
  const fromPath = /\.([a-z0-9]{2,5})$/iu.exec(pathname)?.[1]?.toLowerCase();
  if (fromPath !== undefined && ["avif", "gif", "jpeg", "jpg", "png", "webp"].includes(fromPath)) {
    return fromPath === "jpeg" ? "jpg" : fromPath;
  }
  const mime = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return new Map([
    ["image/avif", "avif"],
    ["image/gif", "gif"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]).get(mime ?? "") ?? "bin";
}

function stableHash(value: string): string {
  return `${hashWithSeed(value, 0x811c9dc5)}${hashWithSeed(value, 0x9e3779b9)}`;
}

function hashWithSeed(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\[\]*_~])/gu, "\\$1");
}

function safeHttpUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function escapeLinkDestination(value: string): string {
  const escaped = value.replace(/([<>()])/gu, "\\$1");
  return escaped.includes(" ") ? `<${escaped}>` : escaped;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
