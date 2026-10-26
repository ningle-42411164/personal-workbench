# 1A：个人工作台只读云端连接

本批范围：网页登录、退出、记住连接、本机/云端隔离和只读读取。没有新增 todo、项目更新、完成、删除、正式数据迁移或离线写入；这些属于尚未开展的 1B/后续批次。仅供所有者使用，不增加注册、多用户或账号管理。

## 认证持久化评估与选择

| 方案 | 当前条件下的结论 |
| --- | --- |
| 访问令牌只放内存、刷新后再授权 | 不满足总规划补充，未采用为最终行为 |
| Worker 的跨站 HttpOnly Cookie | Pages 与 workers.dev 跨站，受第三方 Cookie 和 PWA 浏览上下文限制，不能承诺可靠恢复 |
| 将前端迁到 Worker 同源、HttpOnly 会话 | 可进一步隔离令牌，但会更换现有入口与本地存储 origin，需要另行迁移评审，本批不做 |
| 保留 Pages，公共客户端 PKCE + 轮换续期凭据 | 本批采用；不依赖跨站 Cookie，符合当前 Edge 手机入口；需要明确浏览器存储安全边界 |

| 内容 | 位置、有效期与退出行为 |
| --- | --- |
| GitHub Client ID / Client secret | 继续只在 Cloudflare secrets，不进入前端代码、VITE 配置、URL 或构建产物 |
| 网页 OAuth client_id | 每个浏览器/PWA 首次连接技术注册一个公共客户端，无 client secret；独立标识避免重新授权影响另一设备；不等于新增用户账号 |
| 访问令牌 | 仅当前页面内存，当前服务配置最长 1 小时；到期前或请求时自动使用续期凭据恢复 |
| 续期凭据 | `personal-workbench.cloud-auth.v1` 独立 IndexedDB 内 AES-GCM 密文；AES 密钥为不可导出的 CryptoKey；服务端轮换，授权最长 30 天，不因刷新重设绝对到期时间 |
| PKCE verifier / state | 同一保险库内短期加密事务，最长 10 分钟；回调无论成功、取消、失败或过期均消费并清理 |
| 业务权限 | 仅 `workbench:read`；`offline_access` 只用于续期，不是离线写入权限，不申请 `workbench:write` |
| 默认打开 | 仍显示本机视图；后台恢复已保存的连接，成功后显示已连接，切到云端即可读取，不自动跳转登录 |
| 退出 | 立即丢弃云端请求及快照，清除保存的 session/临时事务、使旧版本凭据不能回写，再尝试撤销该浏览器授权；保留本机事项、动画偏好和 ChatGPT 的独立客户端 |
| 撤销失败 | 本机连接仍清除，明确显示“服务端撤销未确认”；不在下次刷新自动恢复已退出连接 |

加密存储能减少静态明文泄漏，不能防御同源恶意脚本，不能冒称 HttpOnly。清理网站数据、隐私模式、浏览器撤销存储、授权到期或被撤销时需要重新授权。浏览器与安装 PWA 若使用隔离存储，分别建立各自的首次连接，不能声称一个环境授权必然恢复另一个环境。

参考：[Cloudflare OAuth 库](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md)、[oauth4webapi 公共客户端](https://github.com/panva/oauth4webapi/blob/main/examples/public.ts)、[浏览器 OAuth 最佳实践 RFC 10017](https://datatracker.ietf.org/doc/html/rfc10017)、[WebKit 存储与 Cookie 边界](https://webkit.org/tracking-prevention/)。使用锁定的 oauth4webapi 3.8.8，无需购买或新增模型 API。

## 实际回调与调用链

网页回调固定为 `https://ningle-42411164.github.io/personal-workbench/`，使用现有根页面查询参数，不依赖 Pages 嵌套路由。GitHub OAuth App 回调仍为 Worker `/auth/github/callback`，未修改 GitHub App 凭证。

启动：main.js → prepareCloudCallback（挂载前从地址栏移除 OAuth 参数）→ 挂载 App → startCloudConnection（异步，不阻塞本机）→ cloudAuth.finish / restore → 内存访问令牌。

读取：CloudConnection 切换来源/重新读取 → cloudController.refresh → workbenchApi.listItems（仅 GET，完整分页，保留 version）→ Worker OAuth、所有者与读取 scope 校验 → WorkbenchService.list → D1Store.list → 独立云端快照。

本机链路维持 App.vue 的 workbenchData / saveTasks → workbenchData.js 的 writeWorkbenchData；云端模块不调用这条链，也不合并两套 items。本机视图保留原来的编辑、完成、删除、导入导出与启动动画开关。发布时需包含已有启动偏好模块及其静态入口依赖，保留原学习注释。

## 状态与并发规则

- 未成功读取时显示“尚未读取”，只有成功返回空列表时显示云端没有事项；失败不伪装为空。
- 网络失败保留当前会话已成功读取的快照，标记“离线／内容可能已过期”。退出清除快照；没有跨会话云端业务数据缓存。
- 手动、前台、联网触发共用一个在途读取，自动事件有短时去抖。续期凭据用 IndexedDB 原子租约跨窗口串行轮换。
- 切本机、退出、离线时中止请求并增加会话序号；即使旧响应晚到，也不能切回云端、复活快照或覆盖本机状态。
- 凭据存储单独带版本。退出递增版本，迟到续期结果不能重新持久化；跨标签退出广播只有事件，不含令牌或事项。
- 授权取消、错误 state/issuer、过期/重复回调只显示明确错误，由用户再次点击登录；没有自动登录循环。

## 文件与函数学习索引

| 文件 | 入口 |
| --- | --- |
| src/cloud/cloudConfig.js | CLOUD_CONFIG、CloudError：公开地址、权限和可理解的错误 |
| src/cloud/credentialVault.js | createCredentialVault、get/put、clearSession、withLock：加密、持久化、退出版本和轮换互斥 |
| src/cloud/oauthClient.js | createOAuthClient 的 register/authorize/exchange/refresh/revoke：使用成熟 OAuth 库，不记录响应凭证 |
| src/cloud/cloudAuth.js | login、finish、restore、logout、captureOAuthCallback：首次连接、恢复、到期和退出 |
| src/cloud/workbenchApi.js | listItems：只读分页、版本、一次 401 续期，不包含任何业务写方法 |
| src/cloud/cloudController.js | selectSource、refresh、logout、offline：云端视图状态和迟到响应保护 |
| src/cloud/useCloudWorkbench.js | useCloudWorkbench、prepareCloudCallback、startCloudConnection：Vue 接线、前台/联网事件 |
| src/components/CloudConnection.vue | 页头下的来源、登录/退出、状态与重新读取 |
| src/components/CloudReadOnly.vue | 云端列表、项目字段和历史，只读无编辑/完成/删除控件 |
| src/main.js、src/App.vue、src/style.css | 初始化、保留本机视图、独立云端视图、窄屏布局 |
| tests/cloudConnection.test.js、tests/oauthClient.test.js | 保险库、轮换、到期/取消、退出竞争、来源切换、快照保留、去重和只读网络契约 |

## 验证记录（发布与真机结果继续追加）

- 新增连接专项测试 12 项通过；包含真实 OAuth 客户端库配合虚构网络响应的协议测试，不使用真实凭证。
- 当前工作区全部 53 项 Node 测试通过，包含本机业务与启动偏好；原审查测试中有两项明确标记“未修复”的既有缺陷复现，测试通过不表示修复了它们。
- Vite 构建通过；原生 Edge 的本地界面确认默认本机免登录，云端切换隐藏本地编辑入口，未登录只显示连接/读取提示。
- 本轮操作前 D1：唯一项目 `8d6e7252-11fb-4917-aa99-05b21aea46cd`、version=2、历史 2 条；成功回执 2 条。1A 只能读取，发布与实际授权后复核。
- 桌面原生 Edge：用户完成真实授权并读到项目；代理实际核对只读 v2 与两条历史，整页刷新仍默认本机且自动恢复连接，重新切云端免授权读取；实际退出与服务端撤销成功，退出后刷新保持未连接。
- 桌面退出后再次登录尚未完成。用户未实际做第一次拒绝尝试；取消、state/issuer 错误、过期和重复回调由自动化测试覆盖。另以虚构失效回调在已发布桌面页面验证参数清理和明确错误，无自动授权循环。
- 手机 Edge 浏览器：用户反馈真实登录、读取测试项目、整页刷新免再次授权均成功，本机原记录仍在。
- 手机桌面入口：用户独立验证无 Edge 地址栏、可读取测试项目，可作为独立显示模式结果；关闭窗口重开后的免授权恢复尚未单独明确确认，不能用浏览器通过替代此项。
- 用户反馈关掉 VPS 后手机不能读取云端。仅记录该观察：未区分关闭隧道/代理还是远端主机，未做手机网络链路诊断，也未确认断网后的陈旧快照提示与保留表现。Worker 本身部署在 Cloudflare，不能仅据此认定服务随 VPS 停止。
- 当前启动动画 WebP 的原有失败兜底问题并未在 1A 自动改写；动画偏好和正常播放规则保留。若真机触发该问题，单独记录其表现。

本批完成后仍停留在 1A，不开展 1B 的新建 todo、项目更新或正式事项迁移。

## 13:48 总规划交接状态

- 主实现提交：`f3d92eae5a8ffc3d7cf7738fafcfec23f315e0ef`。
- 补丁及当前代码 HEAD：`7ee54f09ce57a1fbd0dbdb13d08728dfb8aac5c6`；正常 Push 成功。
- 最新 Pages [运行 40275442272](https://github.com/ningle-42411164/personal-workbench/actions/runs/40275442272) completed / success；公开页面返回 200。
- 退出迟到响应不覆盖新登录、恢复联网读取、更新提示在云端也可见的补丁已发布。
- 1A 核心代码和主要验证已完成，但尚未宣称全部验收结束；按用户要求先交总规划，不继续 1B 或网络调整。
- 本次补充的实测交接记录暂存于本地文档，未为这次状态汇报额外 Commit/Push。

## 14:01 必要收尾与进入 1B

- 用户在手机桌面入口独立补验：关闭重开免授权恢复、退出后再次登录、拒绝授权正常返回，三项通过。
- 手机断网补验：已有快照保留并显示提示，本机记录仍可用；恢复原可用网络后重新读取成功。没有写入云端业务记录。
- 最后一次授权首次点击允许曾出现超时窗口；用户返回后再次点击成功。未取得错误文字和请求阶段，登记为偶发授权超时，不能声称稳定性问题已定位或修复。
- 关闭 VPS 后不可达继续仅作为网络条件记录；不扩展网络排障，也不修改部署平台。
- 只读复核 D1：唯一项目仍为 version 2、历史 2 条；回执仍仅原先创建与更新的两条。1A 没有新增或修改云端事项。
- 桌面退出后重新登录、拒绝的独立人工验收仍未补做；手机桌面入口已实际通过，协议异常由专项测试覆盖。
- 总规划已授权进入 1B：先显式申请测试写权限，再开发新建 todo、项目支持字段更新。1A 之前的“本批停留”描述为历史范围；不代表本机上传、离线补传或完整同步已经实现。
