# 2026-10-27 续接：展示故障与冲突版本选择

基线：功能版本 2026.10.27.1 / cff387e；记录 4142291。记录提交的 Pages 运行 40445362226 已核对 success。六个原有未提交学习注释文件及两份未跟踪文档保留，不纳入本批。

## 展示故障：未解决，不以数据成功替代

复用原聊天 https://chatgpt.com/c/6ae01bc5-cf18-83e8-b239-2f2f98382e5f 。本轮 read_thread 返回 completed/error=null，但 agentMessage 仅包含内容引用，不能读取实际完整回复或完整工具响应，也不能据此宣称展示正常。

此前完整 curl、ping、list_items 成功证据保留，不重做。锁定 SDK 1.32.2 的 JSON 模式在 resolve Response 前已序列化正文；finally 确实先于调用方读取正文，但没有普遍截断证据。未修改 transport、OAuth 或工具目录。

官方参考：[OpenAI 工具返回规范](https://developers.openai.com/plugins/reference)、[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)。当前 content/structuredContent/outputSchema 组合属于允许结构；不能凭此断言某一返回字段有错。

本轮最小判别：请所有者在原聊天仅调用一次 get_item，ID c5147532-f6bb-4489-8c93-c3a1560ad605，只报告 title/version/done。目的：区分单记录只读返回与多步写链后的展示，不重放历史写请求。结果待反馈，尚无展示修复通过的结论。

## 冲突选择：2026.10.27.2

- 原首页和底部默认收起连接区域保留；冲突对照显示双方名称、类别、状态、标签、项目当前情况/下一步、日期、关联 ID 与版本。
- 采用本机：读取最新云端记录，比较屏幕所示版本；一致时以本机内容和最新 expectedVersion 构造不可变请求，落入原事务队列。未收到回执前继续显示冲突和等待确认；失败复用原 requestId/内容。真正采用原 ID 的本机版本，不另存副本后采用云端。
- 采用云端：同样先检查最新云端版本；将本机内容保留为不自动上传的冲突副本，再采用云端。重复点击不重复创建副本。
- 云端在预览后变化：更新对照后停止，不自动选择。读取后提交前再次变化：服务端 CAS 拒绝，整组保持冲突。
- 随笔关联组整组读取、整组选择、原子提交。复制时关联 ID 共同映射；本机选择成功后的双方记录保存在本机 archive。
- 另一窗口在读取时更改本机或冲突状态：拒绝旧选择。页面重建继续原请求，不清事项、绑定和待同步操作。
- 语义边界：云端已经删除而本机仍有内容时，现有服务禁止复活旧 ID。目前保留双方并提示未解决，不假称本机已采用。是否显式以新 ID 重建并同步已向所有者询问；该变更尚未实施。

参考 [Apache CouchDB 官方复制协议](https://github.com/apache/couchdb/blob/main/src/docs/src/replication/protocol.rst) 的版本检查/冲突边界；复用现有 IDB、CAS、回执和 D1 原子批次，不替换同步框架。

## 文件与调用链 / 学习入口

1. `src/components/SyncSettings.vue`：双方摘要、组内对照、选择与确认，提交屏幕所示 revision/冲突快照。
2. `src/sync/useSyncWorkbench.js/resolve` → `resolveConflict.js/resolveConflict`：在事务外读取全组最新云端；不一致只更新对照。
3. `syncStore.js/reviewConflict` → `resolveWithLocal` 或 `resolveWithCopy`：事务内检查本机 revision/冲突快照，保存原请求或保留副本。
4. `syncStore.js/prepare` → 既有 `syncEngine.run` → `syncApi.send` → 既有服务 `sync/syncBatch` CAS；`acknowledge` 成功才清冲突，`block` 再次冲突继续保留。
5. `src/sync/ownerPhone.js`：可识别版本号；不改变手机首次纳入规则。
6. `tests/categorySync.test.js`：隔离 D1/IndexedDB 的选择、失败重试、再次冲突、关联组及重建页面测试。

## 验证层级

针对性自动验证：11 项版本选择检查通过，包括单条/关联组本机与云端、读取失败、响应丢失同请求重试、再次变化、CAS 阻止部分写、重复选择、过时屏幕、墓碑保护、页面重建和服务端明确拒绝保留双方。完整 `npm test` 为 119 pass / 0 fail，退出 0；`npm run build` 退出 0。Worker 代码未改，不重复部署。

真实环境：之前 MCP 完成 → 手机自动出现、其他分类正常的所有者反馈继续有效，不重复验收。新冲突选择、电脑与手机双向编辑、更新后的队列和连接保留仍待合并真机验收。ChatGPT 回复展示仍待单次只读反馈。

合并验收（发布后）：打开正式 Pages，更新并在底部确认 2026.10.27.2。电脑复用所有者连接，仅启用已绑定事项同步，不导入电脑旧数据。用同一虚构事项在手机改名、电脑自动收到，再在电脑改名、手机自动收到。双端暂停自动同步后分别编辑同一虚构事项，先恢复一端同步，再恢复另一端制造版本冲突；在冲突端分别验证两种明确选择（每条路径一个虚构事项），另一端应自动收到所选结果。全过程不需要断热点、不手动上传。更新前后的正式记录与连接仍在。尚未执行的步骤不得标记通过。

真断网、关闭应用后的后台补传未验证；本批不扩大保证，不排查 VPS。

## 保存与回滚

修改前备份：`C:\Users\lenovo\AppData\Local\Temp\workbench-conflict-f783419587884140b9cb0aa7e807c71f`，含本批文件原文与原有 working-tree.patch。回滚只 revert 本批提交，保留无关未提交修改；不重置浏览器数据，不撤销已同步的云端内容。未创建线上测试数据，未改 Worker 业务或数据库格式，未涉及费用或跨窗发消息。
