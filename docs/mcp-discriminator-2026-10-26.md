# MCP 判别实验与同步失败提示修复（2026-10-26）

按用户要求停止常规反复排查，实验逐步报告后再继续。本轮没有真实事项写入、VPS 排障、OAuth 保护降级或其他分类扩展。

## 实验一：线上 curl 原始 HTTP

基线 Worker：`3a255fba-31f5-4dac-a34e-e5c94c706f99`。Windows curl 8.21.0，HTTP/1.1，Accept 同时包含 application/json、text/event-stream；请求 identity 编码，不输出请求中的 Authorization。

独立公共客户端申请 workbench:read，使用 S256 PKCE 与本机 loopback 回调，用户在原生 Edge 完成本人 GitHub 验证。凭据仅在临时进程内存中供 curl 使用，结束后撤销成功；未读取手机或 ChatGPT 的已有令牌，未把令牌放在命令参数、文件或回复中。

| 顺序 | RPC | 真实状态 | 原始响应体字节 |
| --- | --- | --- | --- |
| 1 | initialize，protocolVersion=2025-11-25 | HTTP/1.1 200 OK | 422 |
| 2 | notifications/initialized | HTTP/1.1 202 Accepted | 0 |
| 3 | tools/list | HTTP/1.1 200 OK | 9139 |
| 4 | tools/call list_items(includeCompleted=true, limit=1, offset=0) | HTTP/1.1 200 OK | 700 |

完整原始响应头/体与请求 JSON 已作为本机 `EXPERIMENT-1-COMPLETE.md` 和四份 `.http` 文件交付，没有截断字段。原始业务数据仅现有虚构待办“自动同步虚拟待办20261026”，ID ae21a9bf-4431-4294-a6cd-1ea202f11c16、v1；text JSON 与 structuredContent 一致，完整响应体可解析。原始 HTTP 附件不作为 OAuth 日志公开提交。

### finally / server.close 时序

项目 `src/mcp.js` 的 finally 确实在调用方读 Response body 之前执行。锁定 SDK 1.32.2 的 `webStandardStreamableHttp.js` 中：

- JSON 模式 handlePostRequest 等待 resolveJson。
- send 先 JSON.stringify 完整结果，再 `new Response(string, ...)` 并 resolveJson。
- close 清理 transport 内的映射；JSON Response 不使用 SSE controller。

因此执行顺序“close 早于 body 读取”成立，但不自动等于“body 被 close 截断”。此次线上 curl 的三项响应均完整、Content-Length 与读取字节吻合，未支持普遍截断假设。没有改 transport/close 逻辑，不把其他请求环境的行为一并排除。

## 实验二：新增纯文本 ping

Worker：`cc215032-b779-42d9-b64f-63d88aad45c1`。

`mcp.js` 独立 registerTool 注册 ping，绕开原工具的包装器；描述不带 outputSchema、_meta，结果只有 content/text，没有 structuredContent、_meta。仍经过相同 OAuth/所有者与读取权限校验，不访问事项数据库。固定文本为 `Personal Workbench ping OK`。

实际顺序：

1. 用户显式选择插件调用，原始反馈：“当前连接未提供 ping 工具，无法调用或显示其返回文本。未调用任何事项读写工具，未创建或修改事项。”此时不是 ping 返回失败，不能作为格式对照。
2. 原生 Edge 现有应用设置找到“刷新工具”，执行刷新；未断开连接、重新授权或修改权限。插件管理连接器没有刷新目录能力，因此使用原生页面完成，未绕过地址校验。
3. 用户重新显式选择插件，仅调用 ping，真实反馈为 `Personal Workbench ping OK`，纯文本正常显示。此为用户真机/真实 ChatGPT 反馈，不以本地测试代替。

### list_items 描述中全部 _meta

线上 tools/list 只有以下一个字段，没有 outputTemplate、resourceUri 或其他 UI _meta：

```json
{"securitySchemes":[{"type":"oauth2","scopes":["workbench:read"]}]}
```

错误结果可能使用 mcp/www_authenticate，但这是权限错误结果的 _meta，不是成功工具描述的字段，不能混为一谈。

## 实验三：基于现有结果的判断与方案（尚未执行格式变更）

- 已证实：独立 curl 可正常初始化、发现和读取；刷新目录后，同一连接中的纯文本 ping 正常显示。
- 不支持：服务整体不可达、任何响应都会被 finally 截断、所有 ChatGPT 工具回复都无法显示。
- 未证实：具体是 structuredContent、outputSchema、securitySchemes 元数据还是旧工具目录导致原回复故障。ping 同时去除了三个字段，而且刷新还更新了原工具目录，存在混杂因素。
- 最小方案第一步：在已刷新目录的同一连接，只读复测一次原 list_items。如果恢复显示，保留现有返回格式，不做无证据修改。
- 若原工具仍失败：只针对 list_items 移除 outputSchema 与 structuredContent，保留 OAuth securitySchemes、业务输入/输出校验、所有者检查和 transport；仅返回既有 JSON 文本做对照。SDK 声明了 outputSchema 时要求 structuredContent，二者必须一起处理，不能只删一个再制造新协议错误。
- 只有该对照成功后才提出对其他工具的兼容处理；不重复创建或更新事项，不先批量删除 metadata，不改库版本或升级依赖。

用户当前仅要求判别与方案，因此没有自动执行上面的原工具复测或格式修改。

## 卡点二：请求失败也明确显示待同步/同步失败

`syncEngine.js` 根据 Worker 请求结果更新提示，不仅依赖 offline 事件：网络异常、超时、HTTP 5xx 均显示“同步失败；待同步修改保留在本机，将自动重试”。发送时也显示待同步数量，登录/权限失败保留待同步提示。

`useSyncWorkbench.save` 在本机事务成功后立即显示待同步，不等下一次网络请求；原有 IndexedDB 原子保存、不可变 requestId、失败保留内容和重试规则不变。退出与离线提示也明确保留待同步修改。

回归使用 navigator 仍为 online 的两种实际请求失败：fetch 抛错、Worker 返回 503。均验证提示、事项/队列保留、相同请求体重试及恢复后的唯一提交。本地测试与构建通过；本轮未把模拟网络失败声称为手机真实断网验收。

卡点三的普通浏览器首次授权、安装入口恢复路径维持现状。

## 阅读入口

- `services/workbench-api/src/mcp.js`：原工具包装器与纯文本 ping 对照。
- `services/workbench-api/test/http.test.js`：检查 ping 的描述、返回字段和零业务改动。
- `src/sync/syncEngine.js`：请求失败转为明确同步状态。
- `src/sync/useSyncWorkbench.js`：本机保存后的即时待同步提示。
- `tests/syncWorkbench.test.js`：online=true 时 Worker 不可达/503 的恢复验证。

参考：[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[MCP Inspector](https://github.com/modelcontextprotocol/inspector)、[MDN onLine](https://github.com/mdn/content/blob/main/files/en-us/web/api/navigator/online/index.md)。关键结论以本机锁定库与本次线上原始 HTTP 为准，不把当前上游代码或问题单直接套作本服务根因。
