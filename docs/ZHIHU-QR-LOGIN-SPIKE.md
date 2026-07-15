# 知乎二维码登录受限技术验证

验证日期：2026-07-15

## 目的

在实现 ZA-09 前，确认 `zhihu-plus-plus` 当前使用的二维码登录端点、响应字段、轮询方式和 Cookie 行为是否仍具备实现基础。验证不扫描二维码、不登录真实账号，不记录 Cookie、二维码 token 或响应正文。

## 参考实现

参考项目：`/Users/anyuanzheng/Projects/zhihu-plus-plus`

关键流程位于 `shared/src/commonMain/kotlin/com/github/zly2006/zhihu/shared/login/QrLogin.kt`：

1. 访问知乎登录页建立匿名上下文。
2. 调用 `/udid` 和验证码上下文端点。
3. `POST /api/v3/account/api/login/qrcode` 创建二维码。
4. `GET /api/v3/account/api/login/qrcode/{token}/scan_info` 轮询。
5. 登录后使用 `GET /api/v4/me` 验证会话。

## 验证结果

| 步骤 | 结果 |
| --- | --- |
| 登录页 | HTTP 200 |
| `/udid` 上下文 | HTTP 200 |
| 验证码上下文 | HTTP 200 |
| 创建二维码 | HTTP 200；存在 `token`、`link`、`expires_at` |
| 首次轮询 | HTTP 403；错误码 `40352`，要求完成网络环境验证 |

验证产生的匿名 Cookie 和临时二维码数据只写入系统临时目录，没有进入项目文件或日志；二维码 token 会自然过期。

## 实现决策

- 保留上述端点，但视为非公开且可能变化的外部接口。
- transport 必须收集并回传 `Set-Cookie`，认证模块维护临时 Cookie jar；UI 不接触请求头。
- 轮询必须识别等待扫描、等待确认、成功、过期、取消、网络失败和 `40352` 风控。
- 风控时停止轮询，向用户说明需要在浏览器完成验证，不尝试绕过知乎限制。
- 持久化前必须通过 `/api/v4/me` 验证会话；启动时再次验证，失败后清除认证数据并降级匿名。
- 自动化测试只使用 mock adapter。真实账号扫码登录保留为手动验收项。
