import { type App, normalizePath, TFile } from "obsidian";

import type {
  AnswerNoteStorage,
  AttachmentLocation,
} from "@/save/AnswerNoteWriter";

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bin",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);

export class ObsidianAnswerNoteStorage implements AnswerNoteStorage {
  constructor(private readonly app: App) {}

  async findNoteByAnswerId(answerId: string): Promise<string | null> {
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (String(frontmatter?.zhihu_answer_id ?? "") === answerId) {
        return file.path;
      }
    }
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(
        content,
      )?.[1];
      const match = frontmatter === undefined
        ? null
        : /^zhihu_answer_id:\s*["']?([^\s"']+)["']?\s*$/mu.exec(
            frontmatter,
          );
      if (match?.[1] === answerId) {
        return file.path;
      }
    }
    return null;
  }

  fileExists(path: string): Promise<boolean> {
    return Promise.resolve(this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null);
  }

  findFileByStem(stem: string): Promise<string | null> {
    const file = this.app.vault
      .getFiles()
      .find(
        ({ basename, extension }) =>
          basename === stem && IMAGE_EXTENSIONS.has(extension.toLowerCase()),
      );
    return Promise.resolve(file?.path ?? null);
  }

  async resolveAttachmentPath(
    filename: string,
    notePath: string,
    location: AttachmentLocation,
    customFolder: string,
  ): Promise<string> {
    if (location === "obsidian") {
      return await this.app.fileManager.getAvailablePathForAttachment(
        filename,
        notePath,
      );
    }
    const requested = normalizePath(`${customFolder}/${filename}`);
    if (this.app.vault.getAbstractFileByPath(requested) === null) {
      return requested;
    }
    const extensionIndex = requested.lastIndexOf(".");
    const stem = requested.slice(0, extensionIndex);
    const extension = requested.slice(extensionIndex);
    for (let suffix = 2; suffix < 10_000; suffix += 1) {
      const candidate = `${stem}-${suffix}${extension}`;
      if (this.app.vault.getAbstractFileByPath(candidate) === null) {
        return candidate;
      }
    }
    throw new Error("无法为图片附件生成可用路径。");
  }

  async writeText(
    path: string,
    content: string,
    overwrite: boolean,
  ): Promise<void> {
    const normalized = normalizePath(path);
    await this.ensureParentFolder(normalized);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (overwrite) {
      if (!(existing instanceof TFile)) {
        throw new Error("待覆盖的回答笔记不存在。");
      }
      await this.app.vault.process(existing, () => content);
      return;
    }
    if (existing !== null) {
      throw new Error("目标笔记路径已存在。");
    }
    await this.app.vault.create(normalized, content);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const normalized = normalizePath(path);
    await this.ensureParentFolder(normalized);
    if (this.app.vault.getAbstractFileByPath(normalized) !== null) {
      return;
    }
    await this.app.vault.createBinary(normalized, data);
  }

  private async ensureParentFolder(path: string): Promise<void> {
    const segments = path.split("/").slice(0, -1);
    let current = "";
    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;
      if (this.app.vault.getAbstractFileByPath(current) === null) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}
