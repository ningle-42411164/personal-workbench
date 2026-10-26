# Personal Workbench 免费测试部署记录

## 范围

- 用户授权：将本批服务代码部署到本人 Cloudflare 免费测试环境，创建空测试资源及配置 GitHub OAuth、ChatGPT MCP。
- 最初部署阶段不购买、不升级，不迁移正式事项，不修改 GitHub Pages，不 commit 或 Push。后续总规划交接已另行明确授权 Commit、正常 Push，并允许现有 Pages 流程运行；仍不迁移正式事项。
- 只把压缩包中的 `services/workbench-api` 导入项目。包内规划文档留在临时解压目录，未覆盖项目原有 docs。
- 原有 30 个 Git 可见文件的 SHA-256 已建立基线；导入后复核全部未变，包括未提交源码、学习注释、测试和锁文件。
- 压缩包 SHA-256：`68AEFAA78387752D60D6FB15DF23D6D4450D1B2876698BD5771B288A9CE2D2D3`。

## 实际新增与调整

- 新增整个服务目录：OAuth、MCP、REST、业务适配、D1 存储、初始迁移、依赖锁文件和 17 项测试。
- `wrangler.jsonc`：测试 Worker 名、唯一账号、真实测试 D1/KV、固定 HTTPS origin；关闭版本预览 URL 和 Worker observability。
- `test/worker.test.js`：用 Node `fileURLToPath()` 替代 URL `.pathname`，修正 Windows `/C:/...` 路径；保留全部断言并补充原因注释。
- `src/authorization.js` 与 `src/index.js`：真实浏览器验收发现授权表单的 `no-referrer` 导致 POST `Origin:null` 被拒；改为只让授权页使用 `same-origin`，其余响应仍为 `no-referrer`，不放宽来源白名单。补充表单策略与 opaque Origin 拒绝检查，17 项测试和打包再次通过。
- 授权页 CSP：为 Chromium 的表单 302 跳转链，精确允许 GitHub 和该次已验证 OAuth 回调的 origin；保留 `default-src 'none'`、防嵌入、base-uri 限制与表单来源检查。新增对应断言，全部测试和打包再次通过。
- `scripts/set-github-secrets.ps1`：让用户在独立本机终端使用 Wrangler 隐藏提示输入秘密；代码不持有秘密。
- `scripts/check-remote.mjs`：只读检查真实 HTTPS 健康状态、匿名拦截与 OAuth 发现。
- `README.md`：更新部署状态与实际输入、检查入口。
- 本记录用于代码答疑和后续继续验收。

首次目录复制漏了递归参数，npm 因空服务目录回退到根项目，曾在根目录重新安装依赖。随后纠正复制并在服务目录重新执行全部要求；原有源码与锁文件哈希未变。

## 本机验证

- Node `v24.21.0`，npm `11.19.0`。
- 服务目录 `npm ci --ignore-scripts`：退出 0。
- 首次服务测试 16/17 通过，唯一失败为 Windows 构建入口路径；修正路径后 `npm test`：17/17 通过，退出 0，无跳过。
- `npm run check`：本地 esbuild 成功，退出 0。
- 现有数据模块成功直接导入；服务复用本地创建、校验、标签规范化与项目更新规则，未替换本地 src。
- 测试覆盖权限、所有者限制、输入验证、创建/查询/项目更新、并发、重复请求、版本冲突、真实 MCP SDK，以及本地 workerd/D1/KV 的 OAuth+PKCE 链路。
- 本地 workerd 的 GitHub 响应为虚构身份，并禁止真实外连；不等同于真实 GitHub/ChatGPT 验收。
- 服务依赖审计报告 7 项（1 low、6 high），涉及 esbuild、Miniflare、sharp、undici、Wrangler、ws、Zod；未执行 `audit fix --force` 或升级锁定版本。前六项属于开发工具依赖链；Zod 属于运行时依赖。服务已有 64 KiB 请求体上限；该边界不等于消除了审计告警。

## Cloudflare 测试资源

原生浏览器已登录与 CLI OAuth 分别核验；`wrangler login` 成功，随后 `whoami` 只返回一个账号。

| 资源 | 实际值 |
| --- | --- |
| 账号 ID | `81328ba470204d0a99ffc2afbfbfc87f` |
| 套餐 | 原生控制台显示 Free、$0、Current plan |
| Worker | `personal-workbench-api-test` |
| D1 名 | `personal-workbench-api-test-db` |
| D1 ID | `883621db-7c51-4798-873b-c24c09da5434` |
| OAuth KV 名 | `personal-workbench-api-test-oauth` |
| OAuth KV ID | `43619700248542d4872a79534dcadfa9` |
| GitHub 所有者 | `ningle-42411164`，不可变 ID `275953771` |
| Origin | `https://personal-workbench-api-test.personal-workbench-ningle-test.workers.dev` |
| MCP | `https://personal-workbench-api-test.personal-workbench-ningle-test.workers.dev/mcp` |
| GitHub 回调 | `https://personal-workbench-api-test.personal-workbench-ningle-test.workers.dev/auth/github/callback` |

创建前 D1 和 KV 列表均为空。新 D1 创建后再次查询无业务表，随后只对该库应用 `0001_initial.sql`，成功。没有导入个人备份。

首次部署发现账号尚未注册 workers.dev 子域；通过本机 Wrangler 注册专用测试子域并完成发布，然后把实际 origin 写回 PUBLIC_BASE_URL 并重新部署。

缺少秘密阶段的真实 HTTPS 请求：`/health` 返回 503、`ready:false`；`/mcp` 与 `/api/items` 返回 503、`NOT_CONFIGURED`。新子域初始 TLS 尚未就绪，后续 Node fetch 正常验证证书并取得上述结果，未跳过证书验证。

## 真实 OAuth 与 ChatGPT 验收进度

- 已在本机 Edge 核实 GitHub 登录账号与所有者一致，OAuth Apps 页面原来没有应用。
- 用户已完成专用 OAuth App 注册及秘密生成，并通过本机 Wrangler 隐藏输入上传两项 secrets；仅查询名称确认存在，不读取值。此记录不包含任何秘密。
- GitHub 身份请求代码仅使用 `read:user`，没有 `repo` 权限。
- `node scripts/check-remote.mjs` 退出 0：真实 `/health` 为 200、`ready:true`；匿名 `/mcp` POST 和 `/api/items` GET 均为 401，带 OAuth challenge；资源、issuer、端点、S256 和读写 scope 正确。
- 新测试库迁移后确认事项数与回执数均为 0；迁移列表无待应用项。
- 已在本机 Edge 确认 ChatGPT 当前账号有“插件 → 添加 → 添加自定义 MCP 服务器”入口，创建了 Personal Workbench Test 连接流程；成功自动发现 OAuth，使用 CIMD，回调为 `https://chatgpt.com/connector_platform_oauth_redirect`，客户端文档为 `https://chatgpt.com/oauth/client.json`。
- 真实同意页已展示应用 ChatGPT、域名 chatgpt.com、返回位置 chatgpt.com 和 `workbench:read` / `workbench:write` / `offline_access`。
- 线上隔离 HTTP 验证：使用公开 ChatGPT CIMD 身份创建新的测试同意事务，GET 同意页 200，返回修正后的 Referrer-Policy/CSP；带该测试事务 cookie 的同源 POST 为 302，目标 origin/path 是 GitHub `/login/oauth/authorize`。没有调用真实 GitHub token endpoint，也未输出 handle、cookie、state、PKCE verifier 或 URL 查询参数。
- 自动浏览器曾报告文档响应处于暂停处理状态；已关闭接管的旧授权标签，请用户在未接管的原生 Edge 新标签完成 OAuth，以区分浏览器工具干扰与服务行为。旧表单曾出现 `INVALID_AUTHORIZATION`（已使用、失效或超时均可能），不能据此断言只是超时。
- 用户在未接管的新原生 Edge 标签完成真实 GitHub OAuth 后成功返回 ChatGPT；管理页实际显示“已连接的账户”、Primary 账户、关联日期 2026-10-26、使用的授权方式 OAuth 和实际 MCP 地址。未使用另一个真实 GitHub 账号做负向登录；非所有者拒绝有代码检查和本地测试证据。
- 已从 ChatGPT 管理页触发“刷新工具”，再通过“在聊天中试用”进入选中插件的测试聊天，提交了只读 `list_items` 验收请求。
- ChatGPT 实际验收已完成，四项工具均参与测试。个人 ChatGPT 联调聊天与自定义插件在本人账号内保留；公开仓库记录不包含个人聊天链接或插件标识。

| 真实 ChatGPT 测试 | 实际结果 |
| --- | --- |
| 初次 list_items | 0 条，nextOffset=null |
| 写入预览等待用户确认 | ChatGPT 展示预览并等待；此时 D1 事项数和回执数都为 0 |
| 用户明确确认后 create_item | 唯一虚构项目创建成功，version=1 |
| 重放原 create_item 输入与 requestId | 返回同一 ID、原始 version=1，没有重复创建 |
| get_project 与 update_project | 先读 version=1，再按 expectedVersion=1 更新成功到 version=2 |
| 重放完整 update_project 输入 | 返回原成功回执，version 仍为 2，历史不重复 |
| 新 requestId 携带旧 expectedVersion=1 | 返回 VERSION_CONFLICT，没有重新读取后自动覆盖 |
| 同创建 requestId 改标题 | 返回 REQUEST_ID_REUSED，没有换 ID 重试或新增事项 |
| 最终 get_project 和 list_items | 唯一项目、version=2、nextOffset=null，字段与历史正确 |

ChatGPT 对两个故意错误的可见结果显示：客户端外层为 `INVALID_ARGUMENT`，业务错误代码分别为 `VERSION_CONFLICT` 和 `REQUEST_ID_REUSED`；后续客户端应提取内层业务错误，不将这两个预期拒绝误认为写入成功。

独立 D1 只读核验与 ChatGPT 结果一致：

- owner_id：`275953771`。
- 唯一事项 ID：`8d6e7252-11fb-4917-aa99-05b21aea46cd`。
- 标题：`MCP联调虚构项目2026-10-26`；version：2。
- currentSituation：`虚构测试：项目更新成功`；nextStep：`完成MCP联调`。
- 历史 2 条：创建此项目、一次当前情况更新。
- 仅 2 个成功回执：`mcp-test-create-20261026-01`、`mcp-test-update-20261026-01`；没有错误测试对应的成功回执。
- 这些虚构数据保留在隔离测试库，未迁移正式事项，也未擅自清空。

## 当前限制与后续工作

- 本轮免费测试服务及真实 ChatGPT 接入没有剩余阻塞；没有购买或升级。
- 非所有者检查有本地负向测试与服务端 ID 比较证据；没有使用第二个真实 GitHub 账号尝试登录。
- 固定依赖的 7 项审计告警尚未升级处理，包含运行时 Zod；限流、防滥用、监控、回执保留策略仍属正式使用前工作。
- 现有手机工作台未接服务，未实现手机同步或离线同步。

## 总规划交接：提交范围与发布边界

- 在 Windows 当前工作区核对 main 与 origin/main 一致后，只暂存本服务目录；不夹带根目录 src、index.html、样式、Vite 配置、已有 docs 或其他未提交测试。
- 原有 30 个非服务文件建立 SHA-256 基线，提交后再次核对，保留学习注释及其他窗口修改。
- 忽略 node_modules、.wrangler、.build、.env 和 .dev.vars 等本地内容；仅提交空值 .env.example，不提交凭证。
- 提交前重新执行服务 npm test（17/17）、npm run check 和只读 check-remote；均成功。
- 现有 deploy-pages.yml 在 main push 时触发，构建并部署根目录前端。本次没有提交前端变化，因此刷新已发布手机页面不会新增登录、云端状态或同步功能。
- GitHub 提交不自动部署 Cloudflare Worker；本批 Worker 已按前述记录单独部署。手机接入方案需先交总规划确认，再实施。

## 代码答疑阅读入口

后续批次更新：手机网页 1A、1B 已有真实验收证据；云端授权引导已发布为 `6516d4b`。本批同步接口与日志/墓碑迁移已部署到原免费测试资源，Worker 版本 `3a255fba-31f5-4dac-a34e-e5c94c706f99`。实际自动同步范围、未完成能力、调用链和手机验收入口以仓库 `docs/cloud-sync-batch1-2026-10-26.md` 为准；上文“手机尚未接入”等为初次部署时的历史状态，不代表最新进度。正式事项未导入。

先读 `src/service.js` 的 `create()` 和 `updateProject()`，再读 `src/domain.js` 如何调用本地 `src/data/workbenchData.js`，然后读 `src/store.js` 的事务、版本号与回执。认证从 `src/index.js` → `src/authorization.js`；工具定义在 `src/mcp.js`。

参考：[Cloudflare 官方 OAuth 库](https://github.com/cloudflare/workers-oauth-provider)、[MCP 官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[OpenAI 自定义 MCP 文档](https://developers.openai.com/api/docs/guides/custom-mcp-server)。本批固定 v1 SDK，不混入 v2 API；OAuth 身份、资源 audience、scope 与服务所有者检查各自执行。

表单来源问题参考 [Fetch 标准中的 Origin header 算法](https://fetch.spec.whatwg.org/#append-a-request-origin-header)：非 CORS 的表单提交在 `no-referrer` 策略下会把 Origin 序列化为 null；`same-origin` 允许同源表单保留 Origin，也不把 referrer 发往跨源 GitHub。
