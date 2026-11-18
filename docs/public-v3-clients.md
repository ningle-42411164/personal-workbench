# 公开版 3.0.0：外部 AI 客户端兼容与联调记录

核对日期：2026-11-18。范围：公开版开发分支的标准 `/mcp` 接口；不改动、不调用私人正式 MCP、Worker、数据或账号。

## 本批结论与证据边界

目前 ChatGPT、Claude、Cherry Studio **均为“官方文档／源码支持，真实客户端待联调”**。尚无本批可用的 Clerk 开发实例和公开隔离服务地址，因此没有任何组合完成真实邮箱登录、工具读写或撤销验收。没有购买订阅、调用付费模型、使用 Computer Use 或操作原生浏览器。

SDK、workerd、模拟身份、隔离数据库和网络桩测试只能证明对应协议与本机实现边界，不能记为 ChatGPT、Claude 或 Cherry Studio 已接通。以后记录实际客户端时须注明客户端及版本、平台、账号方案／工作区权限、模型或提供商、测试服务地址、验证时间与结果；不得记录密码、令牌、验证码或真实事项正文。

## 客户端矩阵

| 组合 | 官方支持与配置方式 | 本批实际前提 | 当前结果 |
| --- | --- | --- | --- |
| ChatGPT ＋账号可用的工具模型 | 官方新文档支持将远端 MCP 添加为插件，支持读写工具、Streamable HTTP、OAuth、DCR 和 CIMD。Web 中从 Plugins 添加 custom MCP server，填写完整 `/mcp` 地址，选择 OAuth，再安装与连接。 | 现有账号／工作区必须实际拥有创建和使用自定义 MCP 的权限，且未被管理员或 Lockdown 限制；服务须能被 OpenAI 访问；还需在公开版开发身份系统完成自己的邮箱验证。 | **文档支持，待联调**；未验证当前账号入口、模型、读写及撤销。 |
| Claude ＋账号可用的 Claude 模型 | 最新官方说明 Free 可添加一个 custom connector；Pro、Max、Ultra、Team、Enterprise 亦支持。通过 Connectors 添加完整远端地址，选择 OAuth；可使用发布身份、自动注册或预注册客户端。 | 远端调用来自 Anthropic 云，不是本机；必须有可公网访问的隔离地址。Team／Enterprise 需要相应组织管理权限；个人账号需有可用的连接名额。 | **文档支持，待联调**；未验证任何账号或模型组合。 |
| Cherry Studio ＋已有、支持工具调用的模型／提供商 | 官方源码实现远端 MCP 与 OAuth public client，注册信息使用 `token_endpoint_auth_method: none`、授权码及刷新令牌流程；本机回调默认形如 `http://127.0.0.1:12346/oauth/callback`，实际端口由客户端确定。 | 安装具备相应功能的客户端版本；配置已有且支持工具调用的模型，并在会话中启用 MCP。模型账号／额度与 Cherry 客户端是两个条件；本批不购买模型服务。 | **源码支持，待联调**；未检查所有者安装版本、模型或真实 OAuth 流程。 |

ChatGPT 的旧 Help Center 页面仍保留 Developer Mode／部分套餐读写限制的表述，而最新开发文档已经使用 Plugins 流程。不能把旧套餐表当作当前所有账号的统一事实，也不能据此要求购买新套餐。以真实账号入口及工作区权限核实为准；本批不执行该账号检查。

官方来源（均于上述日期读取）：

- [OpenAI：Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [OpenAI：MCP 配置与不同客户端表面](https://learn.chatgpt.com/docs/extend/mcp)
- [OpenAI：工作区插件权限](https://learn.chatgpt.com/docs/enterprise/apps-and-connectors)
- [OpenAI：旧 Developer mode 帮助页，套餐表述不能替代当前账号核实](https://help.openai.com/en/articles/12584461)
- [Claude：Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Cherry Studio：官方 OAuth provider 实现](https://github.com/CherryHQ/cherry-studio/blob/main/src/main/ai/mcp/oauth/provider.ts)
- [Cherry Studio：官方 MCP client 实现](https://github.com/CherryHQ/cherry-studio/blob/main/src/main/ai/mcp/connections/ClientMcpConnection.ts)

以上远端 `main` 链接会随上游更新；它们证明核对日期的文档／源码能力，不证明所有已安装版本具备同样行为。

## 服务端必须保持的协议边界

### 发现、授权与范围

- 未授权访问 `/mcp` 返回 `401`，`WWW-Authenticate` 指向实际可公开读取的 protected resource metadata；元数据的 `resource`、`authorization_servers` 与令牌校验使用相同的规范地址。
- 授权服务器公开标准 discovery，准确声明授权、令牌、注册端点及 `S256`。同时保留 DCR 与 CIMD；只声明真正实现的能力，不以 ChatGPT、Claude 或 Cherry 的客户端名字决定权限。
- DCR 的 public client 支持 `token_endpoint_auth_method: none`。CIMD 必须验证 HTTPS 文档、客户端标识及回调匹配，阻止内网／本机地址抓取和不受控重定向。复用现有 OAuth 库的验证，不自行简化为任意 URL 下载。
- 浏览器回调精确匹配已登记地址；兼容原生客户端合法的 HTTP loopback 回调，但不允许任意 HTTP 回调、通配回调或开放重定向。
- 使用授权码＋PKCE S256；`state`／授权上下文绑定浏览器并一次性消费。授权请求和换令牌请求携带正确 `resource`，令牌不可被另一服务或私人站点接受。
- 基础读取使用 `workbench:read`，写入需服务端实际检查 `workbench:write`，不是只设置工具描述。只读授权不得被刷新或客户端输入升级为写权限；需要持续连接时明确申请 `offline_access` 并支持有效的刷新与撤销。
- 只在实现完整时声明 `authorization_response_iss_parameter_supported: true`，并在成功和错误回调都返回准确 `iss`。OpenAI 会精确检查该值；不能只新增一个元数据布尔值。
- 无效／过期／已撤销令牌应拒绝访问；scope 不足应提供可识别的 `insufficient_scope`。MCP 工具错误可保留现有 `mcp/www_authenticate` 提示，但不能因此放过服务端检查。

来源：[MCP 授权规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)、[OpenAI OAuth 要求](https://developers.openai.com/plugins/build/auth)、[Cloudflare 官方 OAuth 库](https://github.com/cloudflare/workers-oauth-provider)。本批沿用既有依赖，不能因上游规范新增版本便声称未测试的新协议版本已经兼容。

### 传输、Origin 与 CORS

- `/mcp` 使用标准 Streamable HTTP。JSON 响应与无状态实现可以保留；客户端 POST 接受 JSON／SSE，通知的成功响应应符合协议。没有 SSE 订阅功能时，GET 的受支持行为应由 SDK 按协议处理，不把它伪装成业务成功。
- 有 `Origin` 时严格校验；无 `Origin` 的服务器端客户端在身份有效时可以访问。不能通过 User-Agent、客户端名称或一个任意请求头绕过身份验证。
- 公开版的受信 Origin 来自明确配置，不继续以硬编码 `chatgpt.com` 作为多客户端适配方案；也不能改成任意 Origin 回显。
- 浏览器路径允许必要预检头，如 `Authorization`、`Content-Type`、`MCP-Protocol-Version`、`MCP-Session-Id`，并暴露 `WWW-Authenticate`、`MCP-Session-Id`；错误响应同样保留适当的 CORS 信息，避免把真实授权错误变成不可读的网络错误。
- CORS 只限制浏览器读取，不能代替 token、scope、租户和版本检查。现有网页 Origin 与原生客户端 loopback **回调地址**是不同概念，不应混为全局业务 Origin 放行规则。

来源：[MCP Streamable HTTP 与 Origin 规则](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。当前已安装 SDK 声明的最高协议版本为 `2025-11-25`；初始化版本协商应由实际测试记录，不把较新客户端文档当作已通过证据。

## Clerk 身份和独立数据隔离

- 外部 AI OAuth 与网页同步最终解析到同一个经过验证的 Clerk 用户 ID。邮箱用于向用户说明目标账号、确认已验证状态；不能用客户端传入的邮箱或 `ownerId` 决定数据库空间。
- 验证 Clerk token 的签名、实例 issuer、有效期及适用的 authorized party；不得只解码 JWT。邮箱验证成功不能仅依赖前端布尔值。开发实例、公开服务和私人正式服务的身份、数据及授权存储必须分开。
- `D1Store` 已有 `owner_id` 查询维度，须继续覆盖事项、已删除标记、关联、变更游标及 mutation receipt。相同 `itemId` 或 `requestId` 在不同用户空间不能串读、串写或重放另一用户回执。
- 本机匿名工作区与 A／B 账号工作区分开；账号切换先停止并隔离旧同步过程。A 的待发送请求、冲突、游标与尚未返回的网络响应不得被 B 的身份继续提交或应用。
- 匿名首次打开不加载 Clerk、不恢复云授权、不发送业务云请求。开启同步后才进入邮箱验证；关联前展示目标邮箱和匿名数量，取消不纳入、不上传。

来源：[Clerk session claims](https://clerk.com/docs/guides/sessions/session-tokens)、[Clerk token 验证](https://clerk.com/docs/guides/sessions/manual-jwt-verification)。以上为实现验收要求，本文件不宣告真实 Clerk 实例已配置。

## 第一批隔离验收建议

1. **协议与发现**：无 token 请求返回正确 401 challenge；发现链可读；SDK 完成 initialize → tools/list → tools/call；输出 schema、错误响应、scope 提示与通知响应正确。测试不通过模型服务。
2. **授权边界**：DCR public client、CIMD、合法 loopback、错误回调、错误 resource、错误 issuer、过期码、PKCE 错误、scope 升权、失效刷新令牌分别验收；拒绝非法 Origin，允许符合身份要求的无 Origin 请求。
3. **A 的写入闭环**：A 授权 read/write，经 MCP create 创建一条隔离事项；同 requestId＋同内容重试取得相同回执且只有一条；同 requestId＋不同内容被拒绝；A 正常网页同步可见该条。
4. **B 的隔离**：B 的 list 不出现 A；B 对 A 的 ID get/update/delete 不能得到 A 正文或改动 A；覆盖 changes、syncState、关联组以及相同 requestId 回执，不能只测列表过滤。
5. **账号切换与取消**：A 留有待同步队列时切 B，B 不发 A 请求；延迟到达的 A 响应不能写入 B；切回 A 可接续原队列。匿名关联取消、邮箱验证失败或保存失败不上传、不丢草稿。
6. **撤销**：A 撤销指定客户端授权后，用原 access token 读和写都被拒绝，用原 refresh token 无法恢复；B 和 A 的其他明确独立授权不被误清。测试真实授权中间件，不能只模拟业务服务返回拒绝。
7. **失败与重试**：保存失败不产生成功回执；冲突保留二选一保护；写入结果不明时复用原请求内容与 requestId，不能换 ID 再建一条。

每项标明是纯单元、SDK＋workerd 集成、真实 Clerk、真实客户端还是手机验收。模拟 A／B 身份通过不代表真实邮箱验证通过。

## 后续真实客户端最小验收

只在公开隔离服务和开发身份实例准备好、账号权限可用时进行，不以私人 MCP 代替。

1. 在所选客户端添加公开隔离 `/mcp`，用测试邮箱 A 完成 OAuth；记录实际客户端／模型／账号条件。
2. 先列出隔离事项；确认后创建一条明确命名的临时事项；核对网页正常同步显示相同 ID。
3. 读取 version 后修改该临时事项；重试核对幂等；如客户端无法确定复用 requestId，单独记录该客户端行为，不能称已通过。
4. 用测试邮箱 B 验证隔离；只操作本次临时事项，不能批量修改私人数据。
5. 从公开版授权管理撤销 A 的该客户端授权，再验证原连接读写均失败、重新授权才恢复。
6. 记录未完成步骤和原因。未接入、未授权、无可用工具模型或缺公开 URL 时统一标为“待联调”，不购买订阅补齐。

本批不发布 v3 标签、正式 Release 或公开站点；真实客户端与手机验证仍未完成。本文件不要求所有者现在启动客户端或浏览器。
