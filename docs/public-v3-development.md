# 公开版 3.0.0 开发中：第一批

本批基于 `5f2cd77bebf0960ec04eca942ebeab7c4a1198c4`，在 `public/v3-stage1` 开发。私人含云版 2.1.1、脱机版 1.1.1 与现有站点、标签、Releases 保持原状。只 Push 开发分支并运行 CI，不部署私人服务，也不创建公开版正式发行物。

## 无账号即可运行

在该分支工作目录的 PowerShell 中：

```powershell
npm ci
npm run dev:public
```

访问 `http://127.0.0.1:5175/personal-workbench-public/`。无需环境文件、Clerk 或 Worker 即可记录、编辑、完成和导出。配置缺失时账号按钮不可用，显示“云功能暂不可用”。重新打开仅恢复当前空间的本机缓存，不启动 Clerk 或业务同步；需要连接时明确点击开启云同步。

生产构建的本机预览：

```powershell
npm run build:public
node scripts/check-public-build.mjs
npm run preview:public
```

访问 `http://127.0.0.1:4175/personal-workbench-public/`。它是开发预览，不是已发布的公共站点。公开入口必须位于独立作用范围；以后部署不得放入私人 `/personal-workbench/` 的旧 Service Worker 范围内。

## 保存与账号调用链

`App.vue → usePublicWorkbench → createPublicWorkspace → publicStore → createSyncStore`：共享业务转换、提醒、保存失败保护、成就事务与草稿保护。匿名和每个 Clerk 用户使用独立记录键；本机写入不等待网络。

显式开启同步后，`identity.authenticate → 按需加载 Clerk → /api/account` 验证邮箱身份。存在匿名事项时显示目标邮箱及数量，确认后在一个 IndexedDB 事务内关联；取消不移动、不上传。关联前的匿名数据保留于目标空间的本机归档。已有不同云端版本沿用冲突二选一，不以登录覆盖本机内容。

之后 `createSyncEngine → createSyncApi → 公开 Worker /api/* → WorkbenchService → D1Store(owner_id)`。仍使用 30 秒正常轮询、5/10/20 秒失败退避及显式唤醒；写入结果不明继续用原 requestId/原内容。切号停止原同步、隔离迟到回执，旧账号缓存、游标、绑定和 outbox 留在旧账号键下。A/B 修订号相同也按账号键重建页面；未保存草稿阻止切号。

连接 AI 只管理授权，不关联匿名事项。外部客户端共用 `/mcp`，经 DCR 或 CIMD、PKCE S256、邮箱登录和明确同意获得读/写授权。MCP 和网页最终以同一个已验证 Clerk `sub` 访问现有事项工具。授权撤销同时阻止访问令牌和刷新令牌。

## 隔离边界

| 范围 | 公开版实现 |
| --- | --- |
| 应用编号 | `release/public.json` 的 3.0.0 / development；不修改两条正式产品编号 |
| IndexedDB | `personal-workbench.public.accounts.v1`，`anonymous` 和 `account:<Clerk sub>` 独立键 |
| 账号事务 | 事项、绑定、队列、游标、成就按账号保存；匿名关联在同库多记录事务提交 |
| 偏好 | `personal-workbench.public.*`；标签规则与提醒冷却额外按账号分开 |
| 广播 | `personal-workbench.public.changed.v1`，接收后只重读当前账号 |
| PWA | `/personal-workbench-public/` 独立 id/start_url/scope，`workbench-public-v3` 缓存前缀 |
| Clerk | 仅按需加载；动态 Clerk 资源不加入首次应用预缓存 |
| Worker | 独立入口 `src/public/index.js`，仅 `PUBLIC_DB` / `PUBLIC_OAUTH_KV`，没有私人绑定 fallback |
| 测试身份 | 仅存在于测试工具；生成 RSA 密钥/JWT，正式入口不支持测试身份头或绕过开关 |

业务事项 schema 仍为 2，私人数据库迁移及同步纳入标记不变。公开服务另有 `migrations-public`：复制共享事项结构并增加自己的账号与撤销记录，只能施加到新建的公开测试数据库。

## 未来真实邮箱联调的一次性配置

所有者已确认暂时没有 Clerk 开发实例，本批不要求现在操作。准备联调时，在 Clerk 官方控制台为本项目创建 **Development** 实例，启用邮箱注册、邮箱验证码登录，准备 A/B 两个可收码邮箱。不要把密钥、验证码或测试账号凭据发送到聊天或提交仓库。

前端复制 `.env.public.example` 为已忽略的 `.env.public.local`：

- `VITE_PUBLIC_API_URL`：公开测试 Worker 的独立 origin，本机为 `http://127.0.0.1:8788`。
- `VITE_PUBLIC_CLERK_PUBLISHABLE_KEY`：同一公开 Development 实例的 publishable key。它可进入前端；secret key 不可使用 `VITE_` 前缀。

服务端在 `services/workbench-api` 将 `wrangler.public.example.jsonc` 复制成已忽略的 `wrangler.public.local.jsonc`，填写独立资源和以下配置。不得复用私人配置文件中的 Worker、D1 或 KV 标识。

| 字段 | 用途 |
| --- | --- |
| `PUBLIC_DEPLOYMENT` | 固定 `workbench-public-v3`，防止误入口配置 |
| `PUBLIC_ENV` | 本地/开发使用 `development` |
| `PUBLIC_BASE_URL` | 公开服务 origin；本地 `http://127.0.0.1:8788` |
| `PUBLIC_FRONTEND_ORIGIN` | 前端 origin；本地 `http://127.0.0.1:5175` |
| `PUBLIC_CLIENT_ORIGINS` | 默认 `[]`；仅在实际浏览器客户端需要时增加明确受信 origin，不是 OAuth 回调清单 |
| `CLERK_ISSUER` / `CLERK_PUBLISHABLE_KEY` | 必须来自同一个公开开发实例 |
| `PUBLIC_DB` / `PUBLIC_OAUTH_KV` | 新的公开隔离 D1/KV 绑定；本地 Wrangler 使用本地存储 |

服务目录已忽略的 `.dev.vars` 只在本机填写 `CLERK_SECRET_KEY`；可另填该实例 `CLERK_JWT_KEY` 公钥用于离线验签。不要将 `.dev.vars` 上传或粘贴到日志。平台部署时改用 Worker secret 配置。

服务目录 PowerShell，本地初始化与运行：

```powershell
npm ci --ignore-scripts
npx wrangler d1 migrations apply PUBLIC_DB --local --config wrangler.public.local.jsonc
npm run dev:public
```

以上 `--local` 不部署远端数据库。真实 AI 云端客户端需要能公开访问的 HTTPS 隔离测试地址，本机地址不能代替；测试 Worker 的免费资源及身份配置确认隔离后再部署，正式域名/DNS/生产邮箱留待后续批次。Clerk 开发邮箱界面、来源配置及 CSP 尚未真实联调。

## 验证方法和证据层级

```powershell
npm test
npm run build:all
npm run build:public
node scripts/check-public-build.mjs
Set-Location services/workbench-api
npm test
npm run check
npm run check:public
```

新增测试不读取所有者数据：

- `publicWorkspace.test.js`：匿名零请求、确认/取消/事务失败、账号队列、迟到响应、暂停、冲突选择、提醒与本机成就隔离。
- `publicAccountUi.test.js`：真实 Vue App + 隔离 DOM/IndexedDB，同修订号/同 ID 的 A/B 切换、草稿保护与 B 保存不改变 A。
- `publicWorkbenchUi.test.js`：真实 Vue App 创建/编辑/完成/导出/重挂持久化；真实 workerd MCP 写入后沿用正常 30 秒轮询，直到 App 行实际显示，再测切 B 与撤销。
- 服务 `public-worker.test.js`：真实 workerd/D1/KV 和生成 RS256 签名，模拟 Clerk 用户 API；验证发行方/来源/过期/签名/邮箱、DCR、CIMD、PKCE、scope、幂等、A/B ID 越权、撤销与刷新。

首次完整隔离示例：MCP 成功回执 **17ms**；其后工作台行显示 **29,970ms**，正常轮询保持 **30,000ms**。这是隔离环境单次记录，不是公网性能承诺；完整测试重跑会打印该次独立计时。单元测试、模拟 DOM 或 workerd 成功均不能代替真实邮箱、真实 AI 客户端、真实浏览器/PWA 或华为 Edge 通过。

本批没有使用浏览器自动化或 Computer Use。ChatGPT、Claude、Cherry Studio + 工具模型均为“文档/源码支持，待联调”，详见 [客户端记录](public-v3-clients.md)。也没有购买订阅、调用付费模型、修改网络或写入私人资源。

2026-11-18 本地最终检查：前端 **227/227**、Worker **31/31**，失败 0；私人/公开 Worker 构建检查、含云/脱机/公开三种前端生产构建均通过。公开部分包含官方 MCP SDK 初始化、工具发现和读写集成。Clerk 按需模块约 1.59MB，构建给出体积提示；该模块已排除首次预缓存，匿名功能不加载它。CI 以 Push 后的固定提交再次检查，结果以开发分支 Actions 为准。

## 保护与回滚

原工作区 `C:\Users\lenovo\IdeaProjects\personal-workbench` 保留不动。本批工作目录为相邻 `personal-workbench-public`，备份位于 `C:\Users\lenovo\IdeaProjects\personal-workbench-backups\20261118-public-stage1`：基线 ZIP、原差异和 7 个保护文件的副本与 SHA256。提交后再按清单逐份比对，不将学习修改纳入公开分支。

本批只开发分支 Push，可对该分支有针对性 `git revert`，或切回基线；不移动旧标签、不重发旧包、不更新私人 main。没有本批线上站点或服务部署需要回滚。公开测试数据库与私人数据库分开；代码回滚不恢复数据，数据恢复仍须主动选择正确空间的备份并确认，不能清空站点数据代替回滚。
