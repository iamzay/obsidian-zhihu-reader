import { requestUrl } from "obsidian";

import type { DownloadedMedia, MediaDownloader } from "@/save/AnswerNoteWriter";

export class ObsidianMediaDownloader implements MediaDownloader {
  async download(url: string): Promise<DownloadedMedia> {
    const response = await requestUrl({ url, throw: false });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`图片请求返回 ${response.status}`);
    }
    const contentType = Object.entries(response.headers).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1];
    if (
      contentType !== undefined &&
      !contentType.toLowerCase().startsWith("image/")
    ) {
      throw new Error("远程资源不是图片");
    }
    return {
      data: response.arrayBuffer,
      ...(contentType === undefined ? {} : { contentType }),
    };
  }
}
