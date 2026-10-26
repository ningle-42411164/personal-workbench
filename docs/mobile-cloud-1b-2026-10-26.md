# 1B：独立云端测试写入闭环

最新进度：本阶段实际手机/GPT 数据闭环及回复加载故障证据见本文后部；后续已获授权的首批自动同步实现、调用链和待真机验收项见 [云端自动同步首批记录](cloud-sync-batch1-2026-10-26.md)。历史段落按当时状态保留。

仅供所有者使用。本机无需登录，继续原有本地读写；本批不自动上传正式事项、不实现离线同步、不开发注册或多用户。总规划最新补充优先于 1A 历史文档中的页头连接位置和只读范围。

## 范围与逐项状态

| 要求 | 状态 | 实际边界与验收依据 |
| --- | --- | --- |
| 1A 手机桌面入口重开恢复、退出重登、拒绝返回 | 已实现 | 用户逐项反馈通过；首次允许偶发超时后重试成功，未定位其发生阶段 |
| 不可达时保留快照、本机可用、恢复读取 | 已实现 | 手机断网三项实测通过；关闭 VPS 后不可达只记录网络条件，不排障 |
| 连接入口集中页尾、默认收起 | 已实现 | App 的最后一个 details，内含来源、登录/退出、重读及写入授权；独立本机预览核对默认收起及原首页布局 |
| 独立云端新建 todo | 已实现 | 手机浏览器创建“古古怪怪”，桌面入口创建 urgent=true 的“咕咕咕咕”，两条均 v1，服务端核对成功 |
| 项目支持字段编辑与保存后重新读取 | 已实现 | 手机保存 currentSituation 后项目 v3；真实 GPT 按确认更新 nextStep 后 v4；手机重新读取两字段一致 |
| 失败留输入、未知结果原请求重试 | 已实现 | 失败保留草稿；网络/5xx/不可信成功响应均按结果不明处理，锁定内容，人工重试复用 requestId 与相同 JSON；隔离测试覆盖 |
| 版本冲突保护 | 已实现 | 409 不覆盖草稿；先读最新、显示对照、人工采用基准，再明确保存；只保留用户修改的字段，不能静默覆盖未改的远端字段 |
| 手机写入 GPT 读到、GPT 修改手机重读 | 已验证工具及数据链路；回复显示仍异常 | 真实 MCP list_items/get_project 成功记录、GPT 写入唯一回执、手机读回 v4 均已取得；ChatGPT 回复正文仍“无法加载”，不能称回复界面已正常 |
| 首次增加写权限授权，之后记住 | 已实现（普通浏览器首次连接） | 桌面入口缺绑定 cookie；普通 Edge 授权后，用户实测桌面入口重开自动恢复测试读写，并成功创建事项 |
| 普通事项编辑、完成/恢复、删除 | 未实现 | 服务无对应 REST；云端不展示可用入口。项目 status 属于已有 PATCH 支持字段 |
| 本机编辑→离线保存→联网自动同步→GPT 最新 | 未实现 | 最终目标已确认；本批只有云端人工写入和快照重新读取，不是完整同步 |
| 正式事项首次纳入云端 | 未实现 | 禁止自动迁移，另交同步方案确认 |
| 项目详情居中弹窗及统一编辑保护 | 未实现 | 需求已确认，现有实现存在缺口，待补齐；本批只核实和提供最小方案 |

## 地址、权限与凭证

- 网页：`https://ningle-42411164.github.io/personal-workbench/`；回调仍为此精确根地址，适配 Pages 子路径。
- API：`https://personal-workbench-api-test.personal-workbench-ningle-test.workers.dev`；MCP 在 `/mcp`。
- 默认登录只读；点击页尾“授权云端测试写入”才明确增加写权限，使用单独的公共客户端。取消升级保留原只读会话；成功后尽力撤销被替代的只读授权，撤销失败时旧授权按原期限失效。
- 访问令牌只在内存；轮换续期凭据仍在独立加密 IndexedDB，绝对最长 30 天。退出先清本机凭据和快照，再尝试服务端撤销；不清本机事项。
- 云端草稿和待确认的单个请求保存在本窗口 sessionStorage 的 `personal-workbench.cloud-drafts.v1`，没有令牌，不进入本机事项或备份。刷新后不自动提交；结果不明仅允许原请求重试。关闭整个浏览上下文可能丢草稿，这不是可靠离线队列。
- GitHub secret 继续只在 Cloudflare secrets；前端没有固定私密凭证。

## 实际调用链与学习索引

| 文件 | 函数／职责 |
| --- | --- |
| `src/App.vue` | 页尾 details 承载连接；cloud 分支挂载 CloudWrites 和云端列表，local 分支保留原 saveTasks 链 |
| `src/components/CloudConnection.vue` | 来源、显式 read/write 授权、退出、重读；默认收起由 App 管理 |
| `src/components/CloudWrites.vue` | 独立 todo 表单、项目字段、原请求重试和冲突对照，不复用本机快速记录 |
| `src/components/CloudReadOnly.vue` | 名称沿用 1A，列表本身展示快照；仅项目有已支持的编辑入口 |
| `src/cloud/cloudWrites.js` | createCloudWrites；editTodo/saveTodo、openProject/editProject/saveProject；send/retry 原请求；loadLatest/rebase 人工解决冲突；suspend 丢弃迟到结果 |
| `src/cloud/workbenchApi.js` | listItems、getProject、createTodo、updateProject；SaveError 区分拒绝/冲突/结果不明，网络不会自动重发写操作 |
| `src/cloud/cloudAuth.js` | login({write:true}) 单独增加权限，accept 保存实际 scope；restore 保持已授权范围，logout 清理及撤销 |
| `src/cloud/oauthClient.js` | register/authorize 明确携带本次 scope，PKCE、兑换、续期与撤销沿用成熟 OAuth 库 |
| `src/cloud/cloudController.js` | refreshAfterWrite 先等保存前读取结束，再发起确认 GET；来源/退出及迟到读取保护 |
| `src/cloud/useCloudWorkbench.js` | auth/API/读控制器/写表单接线，前台联网只触发读取，绝不触发草稿补传 |
| `tests/cloudWrites.test.js` | 未知重试与刷新恢复、版本冲突、确认后读取失败、切来源/退出迟到结果、写权限与 API 网络契约 |
| `tests/cloudConnection.test.js`、`tests/oauthClient.test.js` | 1A 恢复退出及显式权限升级、PKCE 协议 |
| `services/workbench-api/src/http.js` | POST /api/items、GET/PATCH /api/projects/:id 分发 |
| `services/workbench-api/src/service.js`、`store.js` | 权限检查、requestId 指纹回执优先、expectedVersion 比较、D1 原子保存与回执 |
| `src/data/workbenchData.js` | 现有共享业务字段/历史语义，仅引用，不改规则或学习注释 |

创建：确认新建 → cloudWrites.saveTodo 生成一次 requestId → workbenchApi.createTodo → OAuth/所有者/scope → service.create → D1 record+receipt → 服务端确认 → refreshAfterWrite → listItems → 独立列表。

项目：编辑入口 → GET 项目最新 record/version → 独立字段草稿 → 仅 changedFields + expectedVersion + requestId → PATCH → CAS/回执 → 确认 + 重新 GET。失败和冲突不把草稿写进正式快照。

## 本轮验证与发布记录

- 1A 收尾记录提交 `fa81ee4`，正常 Push 到 main。
- 1B 实现前只读 D1：1 个虚构项目 v2、2 条历史、2 条原回执；没有正式事项。后续新增仅本批虚构数据。
- 本机独立生产预览确认：原首页布局、页尾默认收起，切云端后才显示写入表单；未授权写控件禁用，云端没有普通事项完成/恢复/删除控件；控制台无 error/warn。
- 自动验证覆盖的是具体异常和状态规则，不代表手机/ChatGPT 交叉结果；真实结果和发布 SHA 完成后追加。
- 首次测试两个失败分别是测试夹具时间超出授权期限、todo 夹具缺少必需 urgent 布尔值；修正夹具，未删除测试或放宽本机数据规则。
- 旧的本机多页旧快照覆盖与标签校验复现仍按既有测试明确标记“未修复”；不能用总测试数量声称修复。
- 既有学习注释文件及两份未跟踪历史文档保留，不纳入无关改动。

### 14:17 用户要求暂停验证、向总规划交接

- 1B 主实现提交 `b21d77b0166e72940466065bd9eb4ba71efdbfec`，已正常 Push main；Pages [运行 40278415283](https://github.com/ningle-42411164/personal-workbench/actions/runs/40278415283) completed / success，公开页面 200。桌面实际加载 `index-BdNMeThx.js`，确认连接入口位于页面最后且默认收起，本机不显示写入表单。
- 手机用户反馈更新后仍未看到预期效果，点击“授权云端测试写入”后在 Worker 页面显示 `{"code":"INVALID_AUTHORIZATION","message":"授权请求已过期或无效，请重新连接。"}`。仅摘录错误文字，未保存授权 URL 或凭证。
- **本批阻塞：真实手机写入授权未成功，todo 创建、项目更新、手机↔ChatGPT 交叉验证没有通过。** 自动测试和构建成功不替代该结论。
- 目前不知道失败发生于初始 authorize 校验、后续一次性事务还是其他阶段；没有原始请求阶段证据，不归因于缓存、VPS、手机或 PWA 存储，也不声称已修复。此前 1A 首次允许偶发超时仅作相关观察，尚不能判定同一根因。
- 14:15 已在真实 ChatGPT 的 Personal Workbench Test 会话重新调用 list_items / get_project：找不到“手机1B虚构待办2026-10-26”；仍仅原项目 v2，currentSituation 为“虚构测试：项目更新成功”，nextStep 为“完成MCP联调”，历史 2 条。该步只读，未替手机创建事项，也未进行本批 GPT 写入。
- 根目录隔离测试、生产构建、后端测试及 check 通过；额外协议测试覆盖显式写 scope 的注册/授权一致性和保存后读取不能复用旧 GET。公开部署跨站 POST/PATCH 预检均为 204、允许正确 Pages origin。上述均未覆盖这次真机授权失败的根因。
- 本轮没有改 Worker、D1/KV 配置、GitHub OAuth App、秘密或本机网络；没有自动同步、正式迁移或下一批弹窗实现。按用户要求先交接，不继续要求重复授权尝试。

## 编辑保护核实结论（以当前代码为准）

### 14:24 优先级调整：1B 暂缓

总规划要求先推进本机项目弹窗与项目编辑保护。1B 保持“写入闭环未验收”，不再等待它才能开发本机功能。

已核对锁定的 workers-oauth-provider 1.2.4 实现：AuthorizationError 可分别来自 client/redirect/response type/PKCE/resource 校验，以及同意/上游事务的 cookie 缺失、不匹配、过期或已消费；仅凭原 INVALID_AUTHORIZATION 无法判定本次手机根因。scope 本身不在 parseAuthRequest 中按客户端注册 scope 比较，应用另有白名单校验。

已在本地新增 authorizationDiagnostics.js，并给初始 authorize、同意表单、GitHub 返回和授权码兑换加入阶段/枚举错误分类/随机关联号。没有输出完整 URL、原始异常、令牌或秘密；原有 17 项后端测试及 check 通过。但该诊断代码尚未部署，尚未取得真机阶段证据，也未补完针对实际根因的回归测试；不能声称修复。没有继续创建测试 OAuth 客户端、要求手机重试、部署 Worker 或写入 D1。

下一次恢复排查时：先测试并部署最小阶段诊断，取得失败分类，再实施有依据的最小修复。可能的 client/KV 可见性、事务绑定等均只是待验证方向，本轮未将其当作已确认原因。

### 15:01 恢复云端优先

- 总规划重新授权集中推进云端：先修手机写授权及真实双向读写，通过后分批补接口和自动同步；正式事项首次导入另行确认。项目历史、卡片尺寸和视觉优化暂缓。
- 已补真实锁定版本 workerd 诊断回归：未知客户端与错误回调均定位 authorize_parse；同意表单/上游返回缺 cookie 分别定位 consent_approve、github_return；缺绑定的拒绝不会消费合法事务，合法绑定仍能继续；重复返回定位 transaction_expired_or_used。只输出阶段、枚举分类和随机关联号。
- 测试和 check 通过后，诊断已部署到原免费测试 Worker，版本 `b58e9a4c-c99f-4e78-a855-37b096d62d84`。健康 ready、匿名拦截与 OAuth 元数据复核通过。原有所有者/PKCE/scope/一次性校验没有放宽。
- 使用真实公开接口做有界对照：新建一个只读公共测试客户端和一个读写公共测试客户端，两者初始 authorize 均为 200，同意页拒绝均为 302；均在 LAX 观测。没有完成 GitHub 身份授权、取得业务令牌或写入事项。此结果只能排除“请求写 scope 必然失败”，不能替代手机真机定位。
- KV 新键可见性延迟是上游官方文档支持的可能条件，但未取得手机对应分类，不能标为本次已确认根因。已请求一次手机操作回传安全 diagnostic 或成功状态；不要求重建凭证或反复点击旧页。

### 15:08–15:22 根因证据与真实交叉验证

1. 手机桌面入口失败的真实诊断为 consent_approve / browser_binding_missing，关联号 d96cc7ff-bba9-404b-90c1-ac48feb7bced。锁定库在 openTransaction 读取不到该事务的绑定 cookie 时抛此错误，尚未消费同意事务。与初始客户端/scope校验、GitHub身份和授权码兑换无关；也没有证据把本次归为 KV 延迟。浏览器为何未保存/回传 cookie 的更底层系统原因未取得证据，不声称修改了 Edge 内核。
2. 用户对照确认直接打开普通 Edge 链接可授权；重开桌面入口自动显示“已连接·测试读写”，并能写入。表明该设备共享同源加密连接存储，允许“普通浏览器首次连接、桌面入口恢复”路径。
3. 最小修复：安装/全屏上下文的连接按钮不再直接导航到会丢绑定的授权上下文，而展示普通浏览器公开入口与恢复按钮；不假称 target=_blank 一定能强制外部浏览器，若仍被系统接管则明确让用户在 Edge 地址栏打开公开入口。普通浏览器原 OAuth 路径不变。Worker 对浏览器的缺绑定错误保持 400 与原校验，改为安全且可操作的帮助页，JSON 客户端继续获得诊断；不把 handle、state 或秘密放入连接入口。
4. cloudAuth 缓存现在比较持久会话的 clientId/scope/授权期限，发现另一浏览器上下文已完成权限升级时重新恢复，避免旧窗口继续使用缓存的一小时只读权限。续期不静默增加权限；权力仍来自用户在普通浏览器明确完成的新授权。
5. 真机事项：古古怪怪，todo v1，ID d958647d-9398-4af9-bfd5-6730db5969c7；咕咕咕咕，todo v1，urgent=true，ID eb92c9cf-0060-499c-9d30-de772b9b7506。均由用户手机创建，没有由代理代建。
6. 用户手机将原项目当前情况改为“手机1B：项目更新已确认”，v2→v3。用户随后明确确认 GPT 仅将 nextStep 改为“GPT1B：等待手机重新读取确认”；真实 ChatGPT 出现本次工具审批，按确认允许一次，requestId=mcp-1b-phone-cross-20261026-01。D1 核对项目 v4、当前情况保留，唯一成功回执 1 条；用户在手机桌面入口重新读取，两字段一致。
7. ChatGPT 当前回复区域显示“无法加载此回复”，不能把不可见回复算作读取证据。因此增加极小 MCP 成功记录（工具名、success、关联号，无参数/事项/身份/令牌），通过只输出白名单字段的临时日志过滤器核对真实读工具调用。临时日志不保存原始 HTTP 事件。

新增学习入口：browserConnection.js 的 needsBrowserConnection；CloudConnection.requestLogin 的安装上下文分流；cloudController.resumeConnection；cloudAuth.restore 的跨上下文会话识别；authorizationDiagnostics.browserBindingHelp。原本机事项、弹窗、项目历史规则和学习注释不变。

### 15:25 实际读取证据补齐

- 真实 ChatGPT 的只读 list_items 成功：关联号 78cd8998-26ef-4c42-87e1-0702f6e831c1；随后实际 get_project 成功：e3d14e3a-d5de-4c5a-8b27-a97589b48b79、e8ef3d52-2a05-4519-b44f-9c1d8f655dfd。工具成功记录位于 handler 完成后，仅包含工具名、success 和关联号，不包含参数、事项、身份或凭证。
- 日志来自已部署 Worker `c8e83782-71a4-4864-805b-1628d524452e` 的临时 tail，原始 HTTP 事件先在本机流式白名单过滤，仅安全记录进入工具输出；验证后停止该会话，不保存原始事件文件。
- 读取期间没有代理用 CLI 代替 GPT 调用受保护 API；CLI 仅做独立 D1 只读核对。重复的 GPT 读取未写入事项；GPT 更新仍只有既定 requestId 的一条回执。
- 用户已确认桌面入口重新读取看到“GPT1B：等待手机重新读取确认”且当前情况保留。技术数据闭环通过；ChatGPT 回复区域（包括用户手动重发）仍无法加载，属于尚未定位的显示故障，不以工作台缺提示解释，也未扩展修改 ChatGPT。
- 首次授权仍需要普通 Edge；安装上下文本身的 Cookie 行为没有被“修好”或绕过。新界面改为预先引导受支持路径，其入口指引的真机首次触发未通过注销重测；已经获得的普通浏览器授权→桌面入口恢复与实际写入有用户实测证据。

总规划纠正：任务运行结束不能证明实现完成；撤回“已有实现等待定位”假设。状态为“需求已确认，现有实现存在缺口，待补齐”。不继续追问旧成果，不重复重写本轮代码。

- 当前只有 main / origin/main，一个 worktree，无 stash；已获取远端。普通事项与项目详情的未提交差异仅学习注释，行为与 HEAD 相同。相关最后业务提交为 `085fa5d`（2026-09-26），已在当前发布历史内；没有可核实的 10-17 编辑保护实现提交。
- `ProjectDetail.beginEdit` 每次从正式值重置 draft：重复点同字段、换字段都可能丢未保存输入。`App.closeProjectFromOutside / toggleProjectDetails` 与 × 直接卸载详情；完成、删除及折叠也需统一离开检查。现有“独立草稿、保存失败留输入、成功后关闭编辑”有效逻辑必须保留。
- `OrdinaryItem` 的 editing 独立于 expanded；A 编辑时打开 B，A 隐藏但仍 editing，名称和完成复选框被禁用。没有统一离开保护或刷新草稿恢复。此问题未因本批 cloudWrites 的独立保护而修复。
- 新增表单须单列：ProjectCreate 取消/切新增分类会卸载；App 的日常提醒切项会替换草稿；categoryTitle 共用草稿切分类清空；重要日新增取消/× 清空。保存失败保留输入的已有逻辑有效，但关闭、切换、折叠、刷新保护不足。
- 本轮不改这些本机组件。普通事项完成/恢复、删除确认、独立草稿与写入成功才更新页面已合入；完整离开保护和居中弹窗没有发布。下一批方案见 `next-stage-sync-and-dialog-proposal-2026-10-26.md`。

参考：[Cloudflare OAuth](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md)、[oauth4webapi](https://github.com/panva/oauth4webapi)。关键结论：公共客户端 PKCE、刷新不扩大权限；业务原请求重放和版本冲突由本项目已有回执/CAS 提供，本批不引入新同步库。
