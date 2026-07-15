# Zhihu Reader

在 Obsidian 中以原生阅读器浏览知乎问题与回答，并将值得保留的回答保存为 Markdown。

完整的产品定位、功能需求和交互流程见 [产品需求文档](docs/PRODUCT.md)，已确认的方案 A 视觉与组件规范见 [UI 设计规范](docs/UI-DESIGN.md)。

逐步实现顺序、模块 seam 和每项验收标准见 [实施任务拆分](docs/IMPLEMENTATION-PLAN.md)。

## 技术栈

- TypeScript + Obsidian Plugin API
- React
- esbuild
- 普通 CSS + Obsidian CSS Variables
- Zod
- Turndown
- Vitest
- ESLint
- GitHub Actions

## 开发

```bash
npm install
npm run dev
```

生产构建与完整检查：

```bash
npm run build
npm run check
```

构建输出为 Obsidian 插件所需的 `main.js`。开发时将本目录链接或复制到 Vault 的 `.obsidian/plugins/zhihu-answers/`，并在 Obsidian 中启用插件。

## 知乎 API 调研结论

参考 `zhihu-plus-plus` 的实现，问题回答列表使用：

```text
GET https://www.zhihu.com/api/v4/questions/{questionId}/feeds?limit=20&order=default
```

每日热榜使用相同参考实现中的只读接口：

```text
GET https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&mobile=true
```

作者头像 Popover 按需分页读取公开回答：

```text
GET https://www.zhihu.com/api/v4/members/{url_token}/answers?sort_by=created&limit=10
```

回答评论与子回复在用户打开对应界面后按需读取：

```text
GET https://www.zhihu.com/api/v4/comment_v5/answers/{answerId}/root_comment?order_by=score&limit=10
GET https://www.zhihu.com/api/v4/comment_v5/comment/{commentId}/child_comment?limit=10
```

- 返回体主要由 `data` 和 `paging` 组成，回答数据位于 `data[*].target`。
- 请求统一携带浏览器 User-Agent；需要登录态时额外携带知乎 Cookie。
- 登录态请求会复用插件保存的知乎 Cookie，并根据 `d_c0` 生成 `x-zse-93` / `x-zse-96` 请求头；本项目不实现知乎写操作。
- Obsidian 端通过 `requestUrl` 请求，以避开普通浏览器 `fetch` 的 CORS 限制；响应在进入业务层前用 Zod 校验。
- 回答 HTML 通过 Turndown 转为 Markdown，转换器位于 `src/markdown/toMarkdown.ts`。

## 目录

```text
src/
  main.ts                    # 插件入口与视图注册
  view/                      # React 视图
  hotlist/                   # 每日热榜状态、缓存与错误恢复
  author/                    # 作者回答按需加载与分页状态
  comments/                  # 回答评论、子回复与排序分页状态
  zhihu/                     # API 客户端和 Zod schema
  markdown/                  # HTML → Markdown
tests/                       # Vitest 单元测试
```
