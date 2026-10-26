# Personal Workbench 共享数据服务（第一批）

本目录是独立的 Cloudflare Worker 服务，提供受 OAuth 保护的 MCP 与网页 REST API。
不调用任何模型 API，不需要购买模型 API Key。网页接入与学习索引见仓库 `docs/` 的阶段记录。

**状态（2026-10-26，节点一）：已实现手机更新后自动纳入现有待办/项目、原首页自动补传和拉取，复用有效读写授权；首次正式纳入仅从手机执行，不从电脑上传。真实手机更新后的首次纳入待验收。已有手机↔GPT 手动闭环及最小 ping/list_items 正常显示证据，不能代替本节点验收。** 最新实现、验证层级与学习索引见 [节点一记录](../../docs/node-one-2026-10-26.md)。

实际地址、验证证据、修改说明和后续限制见 [部署记录](DEPLOYMENT-2026-10-26.md)。

## 能力与边界

| MCP 工具 | 对应 REST API | 权限 |
| --- | --- | --- |
| `list_items` | `GET /api/items` | `workbench:read` |
| `get_project` | `GET /api/projects/:id` | `workbench:read` |
| `create_item` | `POST /api/items` | `workbench:write` |
| `update_project` | `PATCH /api/projects/:id` | `workbench:read` 和 `workbench:write` |
| `ping`（判别实验） | 无事项 REST 对应，只返回固定纯文本 | `workbench:read` |

- 新建支持现有八种类型；项目更新复用 `src/data/workbenchData.js` 的规则与历史逻辑。
- MCP 没有删除、整库替换、任意 SQL、任意脚本或文件操作工具。
- 新网页同步接口：`GET /api/items/:id`、`PATCH /api/items/:id`、`POST /api/items/:id/completion`、`DELETE /api/items/:id`；均要求版本与幂等标识，写入另需 write scope。
- `GET /api/changes` 返回固定高水位的增量分页及删除标记。`GET /api/sync/items/:id` 返回当前记录或删除标记，`PUT` 仅接受严格校验的待办/项目 v2 快照，保留离线时间与现有历史。新建 expectedVersion=0；更新必须匹配当前版本，分类与创建时间不可改变。
- 网页使用 IndexedDB 事务队列；所有者已明确授权手机现有待办/项目自动纳入，不再逐项预览确认。桌面和隔离页不作为首次纳入来源；冲突保留双方。
- 默认 `list_items`、事项列表和增量 changes 排除共享精确表中的四个虚构测试 ID，按 ID 查询及原数据库记录保留；不按标题判断或批量删除。网页原首页使用同一隔离表。
- 正式事项 JSON 继续使用现有 v2 字段；服务端单独维护版本号和去重回执，不写回浏览器。
- 沿用所有者已授权的 Cloudflare Free 资源；资源名称保留 test 后缀，不表示只存虚构数据。非法旧数据或超限请求保留并提示，不擅自删减或覆盖。
- MCP 判别实验与原始 HTTP 结果、纯文本 ping、工具目录刷新及待处理方案见仓库 `docs/mcp-discriminator-2026-10-26.md`。原事项工具的格式未在本轮自动修改。

## 安装与本地验证

需要 Node.js 24（测试使用内置 `node:sqlite`）。从本目录执行：

```sh
npm ci --ignore-scripts
npm test
npm run check
```

`check` 仅运行本地 esbuild，不执行 Cloudflare 登录、部署或联网预检查。
`test/worker.test.js` 用本地 workerd、真实 D1 模拟器和 KV 验证授权码 + PKCE 全流程。
该测试禁止真实外连，GitHub 身份来自虚构响应；它不替代正式账户、ChatGPT 或手机验收。

SDK 版本固定在仍维护的 v1.32.2，采用 Web Standards Streamable HTTP 传输；避免将 v2 示例直接混入。
认证库固定为 1.2.4。锁文件已包含依赖，升级应单独验证。

## 文件地图与调用链

| 文件 | 为什么需要它 |
| --- | --- |
| `src/index.js` | Worker 入口、配置检查、来源限制、OAuth 资源路由、所有者校验 |
| `src/authorization.js` | 授权同意页、浏览器绑定的授权事务、GitHub 身份核实 |
| `src/mcp.js` | 工具定义、读写标记、OAuth scope 元数据、MCP 传输 |
| `src/http.js` | 网页 REST 路由、正文大小限制与错误响应 |
| `src/service.js` | 每次操作检查权限，连接输入校验、业务规则和持久化 |
| `src/domain.js` | 输入字段边界；复用现有创建/项目更新函数；生成请求内容指纹 |
| `src/store.js` | D1 数据持久化、原子版本检查、去重回执 |
| `src/errors.js` | 返回可理解的错误，不泄漏数据库原始错误 |
| `migrations/0001_initial.sql` | 新测试库的事项表和回执表，不修改任何旧浏览器数据 |
| `migrations/0002_sync_foundation.sql` | 增量日志、删除标记，以及已有云端测试记录的初始快照；不导入本机数据 |

写入调用链：

1. ChatGPT 的写前确认（客户端负责；本次已验证预览等待确认，确认前测试库仍为 0 条）。
2. OAuth 校验令牌的有效性和资源 audience。
3. `index.js` 核对不可变的所有者 GitHub ID。
4. MCP 或 REST 调用同一个 `WorkbenchService`，校验 scope 和输入。
5. 复用工作台业务函数生成新记录或项目更新。
6. `D1Store` 在一个事务内提交数据和请求回执。
7. 返回真实提交的记录及版本号；失败不返回成功。

每次新操作使用新的 `requestId`；同一次操作的网络重试复用原标识和参数。
重复标识但不同参数返回 `409 REQUEST_ID_REUSED`。
项目更新使用 `expectedVersion`；版本过期返回 `409 VERSION_CONFLICT`，不会整份覆盖最新数据。
无实际改动不追加历史或增加版本。首次提交后重试返回原回执，避免“当前情况”历史重复。

## 认证与秘密

- 使用官方 OAuth 库处理 PKCE S256、授权码、刷新令牌、浏览器绑定的同意事务与 upstream state。
- 先显示应用名、应用域名、回调位置和请求 scope；用户同意后才进入 GitHub 身份验证。
- GitHub 仅请求 `read:user`，不申请仓库读写。GitHub access token 不进入数据库或 MCP 返回值。
- 只允许 `OWNER_GITHUB_ID` 指定的账号；该 ID 根据仓库所有者核实为 `275953771`。
- `workbench:read` / `workbench:write` 分别检查，不能仅凭模型或工具说明判断权限。
- 公共数据服务的 OAuth resource audience 是服务 origin；MCP URL 为该 origin 下的 `/mcp`。
- 凭证存储由 OAuth 库与 KV 负责；不是把 GitHub secret 放到网页中。
- CORS 仅是浏览器来源限制，不能代替认证。无 Origin 的服务端请求同样需要令牌。
- 现有 `*.github.io` origin 不含仓库路径，同一 origin 的其他项目并非权限隔离边界；认证仍必须执行。

## 后续部署所需资料（不要在聊天粘贴 secret）

当前配置已绑定专用测试 Worker、D1 和 OAuth KV；缺少 GitHub OAuth secrets 时仍返回 503，不会开放匿名事项读写。

部署阶段需：

1. 用户自己的 Cloudflare 账户和测试环境访问权限；不启用付费套餐。
2. 创建空 D1 测试库与 OAuth KV，填入实际绑定 ID。
3. 取得固定 HTTPS 服务地址，设置 `PUBLIC_BASE_URL`（只含 origin，无尾部 `/`）。
4. 创建本人 GitHub OAuth App，回调地址为 `PUBLIC_BASE_URL/auth/github/callback`。
5. 将 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` 安全写入运行环境 secrets；不要提交 `.dev.vars`。
6. 只对新的测试库执行迁移；不导入个人备份。
7. 完成实际部署后，在 ChatGPT 自定义 MCP 入口填写 `PUBLIC_BASE_URL/mcp`，配置 OAuth 并完成实际调用验收。

本次已获得用户对本人免费测试环境的明确部署授权。最初部署阶段未提交或 Push，也未修改 GitHub Pages；后续总规划交接已明确授权提交、正常 Push，并允许现有 Pages 流程运行。提交范围仅为本服务目录，保留工作区其他未提交修改；不购买或升级，不自动迁移正式事项。

本机安全输入 OAuth 凭证可运行 `scripts/set-github-secrets.ps1`。按 Wrangler 隐藏提示依次粘贴 Client ID 和 Client secret，各按回车；不要把值写入命令或聊天。
配置完成后运行 `node scripts/check-remote.mjs` 检查公开健康状态、未认证拦截与 OAuth 发现元数据。此脚本不读凭证、不写事项，不能代替真实 ChatGPT 验收。

## 测试范围与尚未完成

已覆盖：共享业务规则、版本冲突、重复创建/更新、权限不足、所有者限制、坏输入、数据库故障、
REST 接口、真实 MCP SDK 客户端、授权页面转义和本地 workerd OAuth/D1 完整链路。

本次已实际验收 Cloudflare Free 测试资源、真实 GitHub OAuth、ChatGPT 工具发现、读写前确认和重复/冲突处理。
仍未完成：真实手机首批自动同步验收、其他分类与随笔转换同步、正式数据首次纳入、服务限流/防滥用配置和运行监控。页面关闭后不承诺后台运行；恢复联网、回到前台及页面打开时定时同步。
另有固定依赖版本的审计告警，详见部署记录；本次未自动升级或执行强制修复。

数据库回执目前不自动过期，避免过期后旧请求再次创建。正式使用前需要确定回执保留与去重窗口。
仓库公开，服务端代码可公开，用户数据与秘密必须私有。不能把本目录的测试通过当作安全审计或已上线。

## 上游项目与许可证

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)：具体固定版本的许可证见安装包；当前上游处于 MIT / Apache-2.0 过渡。
- [Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)：MIT。
- [ChatGPT MCP 文档](https://developers.openai.com/api/docs/guides/custom-mcp-server)。

新增代码已加入中文职责注释。阅读可从 `service.js` 的一个创建调用开始，再看 `domain.js`、`store.js`，最后看 OAuth 和 MCP 传输。
