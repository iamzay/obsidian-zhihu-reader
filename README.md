# Zhihu Reader

Read Zhihu questions and answers in a native reader view, then save only the
answers worth keeping as Markdown notes.

Zhihu Reader is not a web-page wrapper. Temporary reading stays outside your
vault, while saved answers use native Markdown and include source metadata.
This is an unofficial integration and is not affiliated with Zhihu.

## Features

- Open a Zhihu question or answer URL, including URLs read on demand from the
  clipboard.
- Read one answer at a time and move between answers with previous/next
  controls.
- Search answers, browse the daily hot list, read comments, and inspect an
  author's public answers.
- Keep a local history of successfully opened questions.
- Vote for or unvote an answer while signed in.
- Save the current answer as Markdown, with optional local image downloads.

Zhihu currently rejects the API requests used by this plugin when they are
anonymous. Enable the **Web viewer** core plugin, then sign in from
**Settings → Zhihu Reader** before using network features.

## Installation

Zhihu Reader requires version 1.13.0 or newer and currently supports desktop
only.

For a manual installation, place `main.js`, `manifest.json`, and `styles.css`
in:

```text
<your vault>/.obsidian/plugins/zhihu-reader/
```

Reload the app and enable **Zhihu Reader** under **Settings → Community
plugins**.

## Privacy and permissions

- Clipboard access happens only when you explicitly run the
  **Open from clipboard** command. The plugin does not monitor the clipboard.
- When checking for an existing saved answer, the plugin examines Markdown
  files only inside the configured answer save folder, not the whole vault.
- Individual files are read or written only to save answers, detect conflicts,
  open a saved note, or download optional image attachments.
- Zhihu cookies and question history are stored in the plugin's private data.
  They are not inserted into Markdown notes.
- The plugin contains no telemetry and does not load executable code from
  external sources.

## 中文说明

在 Obsidian 中阅读知乎问题与回答，并把值得保留的回答保存为原生 Markdown 笔记。

Zhihu Reader 不是知乎网页的 WebView，也不会把临时阅读内容自动写进仓库。问题和回答会转换为 Markdown，使用 Obsidian 原生组件渲染；只有点击“保存回答”后，内容才会进入当前 Vault。

> Zhihu Reader 是非官方插件，与知乎没有隶属关系。知乎接口、登录流程或风控策略发生变化时，部分功能可能暂时不可用。

## 主要功能

- 打开知乎问题或回答链接，也可以从剪贴板识别链接。
- 使用独立阅读面板展示内容，每次只显示一篇回答。
- 通过“上一回答”和“下一回答”浏览同一问题下的其他回答。
- 查看回答评论及子回复。
- 搜索知乎回答、浏览每日热榜和最近查询的问题。
- 点击作者头像查看该用户的公开回答。
- 登录知乎后赞同回答或取消赞同。
- 将当前回答保存为包含元数据的 Markdown 文件。
- 可选择在保存时把正文图片下载到 Vault。

## 安装

当前可通过手动方式安装：

1. 下载或构建插件文件：`main.js`、`manifest.json` 和 `styles.css`。
2. 在 Vault 中创建目录：

   ```text
   <你的 Vault>/.obsidian/plugins/zhihu-reader/
   ```

3. 将上述三个文件放入该目录。
4. 重新加载 Obsidian。
5. 打开“设置 → 第三方插件”，启用 **Zhihu Reader**。

最低支持 Obsidian 1.13.0。

## 快速开始

1. 打开“设置 → Zhihu Reader”，使用知乎 App 扫码登录。
2. 点击左侧 Ribbon 中的“知”字图标，打开 Zhihu Reader。
3. 点击工具栏中的“打开链接”，或从命令面板运行 `Zhihu Reader: 打开知乎内容`。
4. 粘贴完整的知乎问题或回答 URL。
5. 在阅读面板中阅读正文，并通过顶部导航切换回答。
6. 遇到值得保留的回答时，点击“保存回答”。

也可以先复制知乎链接，再运行 `Zhihu Reader: 从剪贴板打开`。

支持以下链接格式：

```text
https://www.zhihu.com/question/问题ID
https://www.zhihu.com/question/问题ID/answer/回答ID
```

目前仅支持完整的 HTTPS 问题或回答链接，不支持知乎短链接、文章、视频和想法链接。

## 阅读与导航

问题链接和回答链接使用相同的阅读界面：

- 打开问题链接时，从该问题的回答列表开始阅读。
- 打开回答链接时，首先显示链接指定的回答，同时预加载同一问题下的其他回答。
- 每次只渲染一篇回答；使用顶部的“上一回答”和“下一回答”切换。
- 可以在“综合排序”和“最近更新”之间切换。
- 问题描述可独立展开或收起。

打开问题或回答成功后，插件会把所属问题加入查询历史。历史只记录问题 ID、问题标题和最后查询时间，不记录具体回答或搜索关键词。

## 登录与点赞

知乎当前会拒绝这些 API 的匿名请求，因此阅读问题和回答、搜索、每日热榜、评论、作者回答和点赞都需要先登录。未登录或登录失效时，阅读器会显示登录提示并禁用相关按钮，不会继续发送匿名请求。

登录方法：

1. 打开“设置 → 核心插件”，启用 **Web viewer（网页浏览器）**。
2. 打开“设置 → Zhihu Reader”。
3. 选择一种登录方式：
   - **网页登录（推荐）**：在 Web viewer 中打开知乎登录页，使用知乎 App 扫码；插件会自动读取当前 Web viewer 的知乎 Cookie 并验证账号。
   - **二维码 API 登录**：使用插件原有的二维码接口登录，作为备用方案。

两种方式都会在设置页提示先启用 Web viewer。推荐的网页登录依赖 Electron Web viewer，因此只支持 Obsidian 桌面端；移动端可以继续尝试二维码 API 登录。

登录 Cookie 只保存在插件私有数据中，不会写入 Markdown 笔记。可以随时在同一设置页退出登录。

Web viewer 登录会读取其中属于 `zhihu.com` 的 Cookie。Obsidian 官方也提醒，第三方插件能够访问 Web viewer Cookie；请只在你信任本插件源码和安装来源时使用网页登录。

回答顶部的赞同数是可操作按钮：

- 点击“赞同”会对该知乎回答点赞。
- 点击“已赞同”会取消点赞。
- 请求失败时，插件会恢复原来的点赞状态和数量。

点赞会直接修改你的知乎账号状态；评论点赞、收藏、关注、回复和发布内容目前不受支持。

## 搜索、热榜与历史

阅读器工具栏提供三个辅助入口：

- **搜索**：搜索知乎回答，点击结果后进入统一阅读面板。搜索关键词不会被保存。
- **每日热榜**：浏览当前热门问题。只浏览榜单不会产生查询历史。
- **历史列表**：查看最近成功打开过的问题，可删除单条记录或清空列表。

这些列表都只在用户打开时按需加载，不会写入 Vault。

## 查看评论和作者回答

- 点击回答的评论数，可以查看根评论和子回复，并在热门、最新排序之间切换。
- 点击作者头像，可以按需查看该用户公开发布的回答。
- 点击作者回答条目后，会在当前阅读器中打开对应回答。

评论功能目前只供阅读，不支持点赞、回复或发布评论。

## 保存为 Markdown

点击回答底部的“保存回答”，或运行 `Zhihu Reader: 保存当前回答`，即可把当前回答写入 Vault。

默认保存位置为：

```text
Zhihu Reader/{问题标题}/{作者名} - {回答ID}.md
```

生成的笔记包含：

- 问题和回答 ID
- 问题标题与作者
- 知乎原文链接
- 原回答发布日期
- 回答正文
- 一个空的“我的笔记”区域

如果目标文件已经存在，插件会让你选择打开、覆盖或取消，不会静默覆盖已有笔记。

临时阅读始终使用远程图片。开启“是否下载图片到 Vault”后，只有保存回答时才会下载图片；下载失败的图片会保留远程链接。

## 设置

在“设置 → Zhihu Reader”中可以调整：

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| 每批回答数 | 6 | 每次从问题回答列表请求 1–20 篇回答 |
| 默认排序 | 综合排序 | 打开问题时使用的回答排序 |
| 历史条目上限 | 50 | 最多保留的问题查询记录数量 |
| 回答保存目录 | `Zhihu Reader` | 相对于 Vault 根目录 |
| 文件路径模板 | `{问题标题}/{作者名} - {回答ID}.md` | 支持问题标题、作者名、回答 ID 和问题 ID |
| 保存后自动打开笔记 | 开启 | 保存成功后打开生成的 Markdown 文件 |
| 是否下载图片到 Vault | 关闭 | 仅在保存回答时下载正文图片 |

下载图片开启后，可以选择遵循 Obsidian 的附件设置，或指定独立附件目录。

## 命令

可以在 Obsidian 的“设置 → 快捷键”中为这些命令分配快捷键：

| 命令 | 用途 |
| --- | --- |
| `Zhihu Reader: 打开知乎内容` | 输入问题或回答 URL |
| `Zhihu Reader: 从剪贴板打开` | 识别剪贴板中的知乎链接 |
| `Zhihu Reader: 搜索知乎回答` | 打开回答搜索 |
| `Zhihu Reader: 查看每日热榜` | 打开每日热榜 |
| `Zhihu Reader: 查看历史列表` | 打开问题查询历史 |
| `Zhihu Reader: 保存当前回答` | 保存当前显示的回答 |

## 数据与隐私

- 临时阅读、评论、搜索结果、热榜和作者回答列表不会写入 Vault。
- 只有用户主动保存的回答及可选图片会进入 Vault。
- 查询历史保存在插件数据中，只包含问题 ID、标题和查询时间。
- 知乎登录 Cookie 保存在插件私有数据中，不会写入回答笔记。
- 点赞是用户主动触发的知乎账号写操作；插件不会自动点赞。
- 插件不会持续监听剪贴板，只有运行剪贴板命令时才读取一次。
- 为检查重复保存，插件只会扫描设置中“回答保存目录”下的 Markdown 文件，不会枚举整个 Vault。

## 常见问题

### 内容无法加载

先确认已经在“设置 → Zhihu Reader”完成登录，并检查链接是否为受支持的完整 HTTPS 链接。部分内容可能已删除或仅作者可见，可以使用“在浏览器打开”确认原内容是否仍然可访问。

### 搜索、热榜或点赞提示登录

前往“设置 → Zhihu Reader”重新扫码登录。知乎登录过期或触发风控时，可能需要先在浏览器中完成验证。

### 无法读取剪贴板

检查 Obsidian 是否具有系统剪贴板权限，或改用“打开知乎内容”命令手动粘贴 URL。

### 图片没有保存到本地

确认设置中的“是否下载图片到 Vault”已经开启。个别图片因权限或网络原因下载失败时，笔记会继续使用远程图片链接。

## 开发与贡献

本项目使用 TypeScript、Obsidian Plugin API、React、esbuild、Zod、Turndown、Vitest 和 ESLint。

```bash
npm install
npm run dev
```

提交改动前运行：

```bash
npm run check
```

更多设计与实现资料：

- [产品需求文档](docs/PRODUCT.md)
- [UI 设计规范](docs/UI-DESIGN.md)
- [实施任务拆分](docs/IMPLEMENTATION-PLAN.md)

## License

本项目基于 [MIT License](LICENSE) 开源。
