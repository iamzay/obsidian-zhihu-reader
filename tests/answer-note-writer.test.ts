import { describe, expect, it } from "vitest";

import type { AnswerDocument } from "@/domain/zhihu";
import {
  AnswerNoteWriter,
  type AnswerNoteStorage,
  type AttachmentLocation,
  type DownloadedMedia,
  type MediaDownloader,
  renderFolderPath,
  renderNotePath,
} from "@/save/AnswerNoteWriter";

class MemoryNoteStorage implements AnswerNoteStorage {
  readonly text = new Map<string, string>();
  readonly binary = new Map<string, ArrayBuffer>();
  failTextWrite = false;

  findNoteByAnswerId(answerId: string): Promise<string | null> {
    for (const [path, content] of this.text) {
      if (content.includes(`zhihu_answer_id: "${answerId}"`)) {
        return Promise.resolve(path);
      }
    }
    return Promise.resolve(null);
  }

  fileExists(path: string): Promise<boolean> {
    return Promise.resolve(this.text.has(path) || this.binary.has(path));
  }

  findAttachmentByStem(stem: string): Promise<string | null> {
    return Promise.resolve(
      [...this.binary.keys()].find((path) =>
        path.split("/").at(-1)?.startsWith(`${stem}.`),
      ) ?? null,
    );
  }

  resolveAttachmentPath(
    filename: string,
    _notePath: string,
    _location: AttachmentLocation,
    customFolder: string,
  ): Promise<string> {
    return Promise.resolve(`${customFolder}/${filename}`);
  }

  writeText(path: string, content: string, overwrite: boolean): Promise<void> {
    if (this.failTextWrite) {
      return Promise.reject(new Error("write failed"));
    }
    if (!overwrite && this.text.has(path)) {
      return Promise.reject(new Error("exists"));
    }
    this.text.set(path, content);
    return Promise.resolve();
  }

  writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.binary.set(path, data);
    return Promise.resolve();
  }
}

class FixtureDownloader implements MediaDownloader {
  readonly requests: string[] = [];
  failures = new Set<string>();

  download(url: string): Promise<DownloadedMedia> {
    this.requests.push(url);
    if (this.failures.has(url)) {
      return Promise.reject(new Error("download failed"));
    }
    return Promise.resolve({
      data: new Uint8Array([1, 2, 3]).buffer,
      contentType: "image/jpeg",
    });
  }
}

const defaults = {
  saveFolder: "Zhihu Reader",
  notePathTemplate: "{问题标题}/{作者名} - {回答ID}.md",
  imageMode: "remote" as const,
  attachmentLocation: "custom" as const,
  attachmentFolder: "Zhihu Reader/attachments",
};

describe("AnswerNoteWriter", () => {
  it("writes one standalone Markdown note for the current answer", async () => {
    const storage = new MemoryNoteStorage();
    const writer = new AnswerNoteWriter(
      storage,
      new FixtureDownloader(),
      () => new Date("2026-07-15T08:00:00.000Z"),
    );

    const result = await writer.save(answer(), defaults);

    expect(result).toMatchObject({ status: "saved" });
    const [path, content] = [...storage.text.entries()][0] ?? [];
    expect(path).toBe("Zhihu Reader/问题 标题/作者 名 - 99.md");
    expect(content).toContain('zhihu_answer_id: "99"');
    expect(content).toContain('zhihu_question_id: "100"');
    expect(content).toContain('created_at: "2023-11-14"');
    expect(content).not.toMatch(/created_at:.*T/u);
    expect(content).toContain("# 问题/标题");
    expect(content).toContain("## 我的笔记");
  });

  it("returns a conflict and overwrites only after explicit confirmation", async () => {
    const storage = new MemoryNoteStorage();
    const writer = new AnswerNoteWriter(storage, new FixtureDownloader());
    const first = await writer.save(answer(), defaults);
    const path = first.status === "saved" ? first.path : "";

    await expect(writer.save(answer(), defaults)).resolves.toEqual({
      status: "conflict",
      path,
    });
    await expect(
      writer.save(answer("更新后的正文"), { ...defaults, overwritePath: path }),
    ).resolves.toMatchObject({ status: "saved", path });
    expect(storage.text.get(path)).toContain("更新后的正文");
  });

  it("does not leave a Markdown file when the write fails", async () => {
    const storage = new MemoryNoteStorage();
    storage.failTextWrite = true;
    const writer = new AnswerNoteWriter(storage, new FixtureDownloader());

    await expect(writer.save(answer(), defaults)).rejects.toThrow("write failed");
    expect(storage.text.size).toBe(0);
  });

  it("does not overwrite an unrelated note at the rendered path", async () => {
    const storage = new MemoryNoteStorage();
    storage.text.set(
      "Zhihu Reader/问题 标题/作者 名 - 99.md",
      "unrelated note",
    );
    const writer = new AnswerNoteWriter(storage, new FixtureDownloader());

    const result = await writer.save(answer(), defaults);

    expect(result).toMatchObject({
      status: "saved",
      path: "Zhihu Reader/问题 标题/作者 名 - 99-99.md",
    });
    expect(storage.text.get("Zhihu Reader/问题 标题/作者 名 - 99.md")).toBe(
      "unrelated note",
    );
  });

  it("keeps suffixing when every stable candidate is occupied", async () => {
    const storage = new MemoryNoteStorage();
    const writer = new AnswerNoteWriter(storage, new FixtureDownloader());
    const first = await writer.save(answer(), defaults);
    if (first.status !== "saved") {
      throw new Error("Expected saved result");
    }
    storage.text.set(first.path, "unrelated note");
    const second = await writer.save(answer(), defaults);
    if (second.status !== "saved") {
      throw new Error("Expected saved result");
    }
    storage.text.set(second.path, "unrelated note");
    const third = await writer.save(answer(), defaults);
    if (third.status !== "saved") {
      throw new Error("Expected saved result");
    }
    storage.text.set(third.path, "unrelated note");

    const result = await writer.save(answer(), defaults);

    expect(result).toMatchObject({ status: "saved" });
    if (result.status !== "saved") {
      throw new Error("Expected saved result");
    }
    expect(result.path).toMatch(/-2\.md$/u);
  });

  it("does not emit an unsafe author profile link", async () => {
    const storage = new MemoryNoteStorage();
    const writer = new AnswerNoteWriter(storage, new FixtureDownloader());
    const unsafeAnswer = {
      ...answer(),
      author: { ...answer().author, profileUrl: "javascript:alert(1)" },
    };

    const result = await writer.save(unsafeAnswer, defaults);

    if (result.status !== "saved") {
      throw new Error("Expected saved result");
    }
    const content = storage.text.get(result.path) ?? "";
    expect(content).not.toContain("javascript:");
    expect(content).toContain("> 作者：作者:名 · 42 赞同");
  });

  it("downloads images only while saving, reuses duplicates and reports partial failure", async () => {
    const storage = new MemoryNoteStorage();
    const downloader = new FixtureDownloader();
    const failedUrl = "https://pic.example/fail.png";
    downloader.failures.add(failedUrl);
    const writer = new AnswerNoteWriter(storage, downloader);
    const richAnswer = answer(
      `<p><img alt="成功" src="https://pic.example/a.jpg?utm_source=zhihu" /></p>
       <p><img alt="重复" src="https://pic.example/a.jpg?utm_source=zhihu" /></p>
       <p><img alt="失败" src="${failedUrl}" /></p>`,
    );

    const result = await writer.save(richAnswer, {
      ...defaults,
      imageMode: "vault",
    });

    expect(result).toMatchObject({ status: "saved" });
    if (result.status !== "saved") {
      throw new Error("Expected saved result");
    }
    expect(downloader.requests).toEqual([
      "https://pic.example/a.jpg",
      failedUrl,
    ]);
    expect(storage.binary.size).toBe(1);
    expect(result.warnings).toHaveLength(1);
    const content = storage.text.get(result.path) ?? "";
    expect(content).toContain("![[Zhihu Reader/attachments/");
    expect(content).toContain(`![失败](${failedUrl})`);
  });

  it("reuses a URL-hashed attachment across different answer notes", async () => {
    const storage = new MemoryNoteStorage();
    const downloader = new FixtureDownloader();
    const writer = new AnswerNoteWriter(storage, downloader);
    const content = `<img src="https://pic.example/shared.jpg" />`;

    await writer.save(answer(content), { ...defaults, imageMode: "vault" });
    const second = {
      ...answer(content),
      id: "98",
      url: "https://www.zhihu.com/question/100/answer/98",
    };
    await writer.save(second, { ...defaults, imageMode: "vault" });

    expect(downloader.requests).toEqual(["https://pic.example/shared.jpg"]);
    expect(storage.binary.size).toBe(1);
  });

  it("sanitizes every dynamic path segment", () => {
    expect(renderNotePath("{问题标题}/{作者名}", answer())).toBe(
      "问题 标题/作者 名.md",
    );
    expect(renderFolderPath("媒体/{问题ID}/{作者名}", answer())).toBe(
      "媒体/100/作者 名",
    );
  });
});

function answer(contentHtml = "<p>回答正文</p>"): AnswerDocument {
  return {
    id: "99",
    url: "https://www.zhihu.com/question/100/answer/99",
    author: {
      name: "作者:名",
      headline: "",
      profileUrl: "https://www.zhihu.com/people/author",
    },
    contentHtml,
    excerpt: "回答正文",
    voteupCount: 42,
    isVoted: false,
    commentCount: 3,
    createdTime: 1_700_000_000,
    question: {
      id: "100",
      title: "问题/标题",
      url: "https://www.zhihu.com/question/100",
      detailHtml: "",
      excerpt: "",
      topics: [],
      answerCount: 1,
      followerCount: 2,
    },
  };
}
