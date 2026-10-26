# 1B：独立云端测试写入闭环

仅供所有者使用。本机无需登录，继续原有本地读写；本批不自动上传正式事项、不实现离线同步、不开发注册或多用户。总规划最新补充优先于 1A 历史文档中的页头连接位置和只读范围。

## 范围与逐项状态

| 要求 | 状态 | 实际边界与验收依据 |
| --- | --- | --- |
| 1A 手机桌面入口重开恢复、退出重登、拒绝返回 | 已实现 | 用户逐项反馈通过；首次允许偶发超时后重试成功，未定位其发生阶段 |
| 不可达时保留快照、本机可用、恢复读取 | 已实现 | 手机断网三项实测通过；关闭 VPS 后不可达只记录网络条件，不排障 |
| 连接入口集中页尾、默认收起 | 已实现 | App 的最后一个 details，内含来源、登录/退出、重读及写入授权；独立本机预览核对默认收起及原首页布局 |
| 独立云端新建 todo | 待验收 | 代码与隔离协议测试完成，待已发布页面、手机和 ChatGPT 交叉结果 |
| 项目支持字段编辑与保存后重新读取 | 待验收 | 先 GET 最新版本，PATCH 仅实际变化字段；新建或保存成功后发起新的 GET，保存前的在途读取不冒充保存后确认 |
| 失败留输入、未知结果原请求重试 | 已实现 | 失败保留草稿；网络/5xx/不可信成功响应均按结果不明处理，锁定内容，人工重试复用 requestId 与相同 JSON；隔离测试覆盖 |
| 版本冲突保护 | 已实现 | 409 不覆盖草稿；先读最新、显示对照、人工采用基准，再明确保存；只保留用户修改的字段，不能静默覆盖未改的远端字段 |
| 手机写入 GPT 读到、GPT 修改手机重读 | 待验收 | 仅虚构测试数据；不能用 D1/测试通过替代真实 ChatGPT 与手机验证 |
| 首次增加写权限授权，之后记住 | 待验收 | 独立公共写客户端，明确请求 read/write/offline_access；只读续期不能扩大权限；已获权限按原 30 天绝对期限恢复 |
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

## 编辑保护核实结论（以当前代码为准）

总规划纠正：任务运行结束不能证明实现完成；撤回“已有实现等待定位”假设。状态为“需求已确认，现有实现存在缺口，待补齐”。不继续追问旧成果，不重复重写本轮代码。

- 当前只有 main / origin/main，一个 worktree，无 stash；已获取远端。普通事项与项目详情的未提交差异仅学习注释，行为与 HEAD 相同。相关最后业务提交为 `085fa5d`（2026-09-26），已在当前发布历史内；没有可核实的 10-17 编辑保护实现提交。
- `ProjectDetail.beginEdit` 每次从正式值重置 draft：重复点同字段、换字段都可能丢未保存输入。`App.closeProjectFromOutside / toggleProjectDetails` 与 × 直接卸载详情；完成、删除及折叠也需统一离开检查。现有“独立草稿、保存失败留输入、成功后关闭编辑”有效逻辑必须保留。
- `OrdinaryItem` 的 editing 独立于 expanded；A 编辑时打开 B，A 隐藏但仍 editing，名称和完成复选框被禁用。没有统一离开保护或刷新草稿恢复。此问题未因本批 cloudWrites 的独立保护而修复。
- 新增表单须单列：ProjectCreate 取消/切新增分类会卸载；App 的日常提醒切项会替换草稿；categoryTitle 共用草稿切分类清空；重要日新增取消/× 清空。保存失败保留输入的已有逻辑有效，但关闭、切换、折叠、刷新保护不足。
- 本轮不改这些本机组件。普通事项完成/恢复、删除确认、独立草稿与写入成功才更新页面已合入；完整离开保护和居中弹窗没有发布。下一批方案见 `next-stage-sync-and-dialog-proposal-2026-10-26.md`。

参考：[Cloudflare OAuth](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md)、[oauth4webapi](https://github.com/panva/oauth4webapi)。关键结论：公共客户端 PKCE、刷新不扩大权限；业务原请求重放和版本冲突由本项目已有回执/CAS 提供，本批不引入新同步库。
