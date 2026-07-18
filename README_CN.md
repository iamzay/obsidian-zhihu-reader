# Zhihu Reader

[English version](README.md)

在原生阅读视图中阅读知乎问题与回答，并将真正值得保留的回答保存为 Markdown 笔记。

> Zhihu Reader 是一个非官方项目，与知乎没有隶属关系。
> 知乎 API、登录流程或风控机制发生变化时，部分功能可能暂时不可用。

## 功能

- 使用 Obsidian 的 Markdown 渲染器展示问题与回答。
- 搜索知乎回答、浏览个性化推荐和每日热榜。
- 在本地保存已成功打开的问题历史。
- 阅读回答评论。
- 点击作者头像可浏览该作者的公开回答。
- 点赞。
- 默认将每篇回答保存为一个独立的 Markdown 文件。

## 安装

### 社区插件

Zhihu Reader 上架社区插件市场后，可按以下步骤安装：

1. 打开 **设置 → 第三方插件**。
2. 选择 **浏览**，搜索 **Zhihu Reader**。
3. 安装并启用插件。

### 手动安装

1. 从 Release 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在 Vault 中创建以下目录：

   ```text
   <你的 Vault>/.obsidian/plugins/zhihu-reader/
   ```

3. 将上述三个文件复制到该目录。
4. 重新加载 Obsidian。
5. 在 **设置 → 第三方插件** 中启用 **Zhihu Reader**。

## 快速开始

1. 在 **设置 → 核心插件** 中启用 **Web viewer（网页浏览器）**。
2. 打开 **设置 → Zhihu Reader**。
3. 使用任一可用方式登录知乎。
4. 点击 Zhihu Reader 的 Ribbon 图标。
5. 点击阅读器工具栏中的 **打开链接**，粘贴支持的 URL。
6. 阅读回答、切换回答，或保存当前回答。

你也可以先复制支持的 URL，然后执行 **从剪贴板打开** 命令。

支持的 URL 格式：

```text
https://www.zhihu.com/question/QUESTION_ID
https://www.zhihu.com/question/QUESTION_ID/answer/ANSWER_ID
```

## 阅读快捷键

| 按键 | 操作 |
| --- | --- |
| `H` | 上一个回答 |
| `J` | 向下滚动 |
| `K` | 向上滚动 |
| `L` | 下一个回答 |

## 设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| 每次请求回答数 | `6` | 每页请求 1 至 20 篇回答 |
| 默认回答排序 | 综合排序 | 控制问题回答列表的初始排序 |
| 历史记录上限 | `50` | 最多保留的问题历史条目数 |
| 回答保存目录 | `Zhihu Reader` | 相对于 Vault 根目录的文件夹 |
| 笔记路径模板 | 问题/作者/回答 ID | 控制生成的笔记路径 |
| 保存后打开 | 开启 | 打开生成的 Markdown 笔记 |
| 下载图片到 Vault | 关闭 | 仅在保存回答时下载图片 |

启用图片下载后，附件可以遵循 Obsidian 的全局附件设置，也可以使用独立目录。

## 命令

命令面板提供以下操作：

- 打开知乎问题或回答 URL。
- 从剪贴板打开知乎 URL。
- 搜索知乎回答。
- 打开个性化推荐流。
- 打开每日热榜。
- 打开问题历史。
- 保存当前显示的回答。

可以在 **设置 → 快捷键** 中为这些命令分配 Obsidian 快捷键。

## 开发

本项目使用 TypeScript、Obsidian Plugin API、React、esbuild、Zod、Turndown、Vitest、ESLint 和 GitHub Actions。

安装依赖并启动开发构建：

```bash
npm install
npm run dev
```

提交修改前运行所有检查：

```bash
npm run check
```

项目文档：

- [产品需求文档](docs/PRODUCT.md)
- [UI 设计](docs/UI-DESIGN.md)
- [实施计划](docs/IMPLEMENTATION-PLAN.md)

## 许可证

Zhihu Reader 基于 [MIT License](LICENSE) 发布。

## 致谢

特别感谢 [Zhihu++](https://github.com/zly2006/zhihu-plus-plus) 的开源工作。该项目的实现为理解知乎 API 请求流程提供了重要参考，也帮助 Zhihu Reader 得以实现。
