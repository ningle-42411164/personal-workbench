# 剩余分类同步实施记录

最新批次：`2026.10.27.1`，八类同步、转换关联原子提交、MCP 操作补齐及访客纯本机体验。下面第一批的“转换暂缓”是历史范围，已由第二批接续；真实手机和真实 ChatGPT 新工具验收仍与隔离测试分开记录。

基线：`21c4310` / `2026.10.26.1` 已由所有者手机确认可用；不重复该流程。未提交学习修改继续保留。MCP 原有返回格式和目录不变。

## 分类范围与两批发布

| 分类 | 原状态 | 本批安排 |
| --- | --- | --- |
| 待办、项目 | 节点一已支持并经手机验收 | 复用 |
| 随笔、等待中、购物、娱乐创作 | REST/MCP 已能创建读取，手机同步缺失 | 第一批，2026.10.26.2 |
| 日常持续、重要日 | 手机同步缺失；业务不适用勾选完成 | 第二批 |
| 随笔转换关联 | 本机原子保存，跨网络缺原子提交/关联分页 | 第二批；第一批关联双方暂缓发送 |

第一批已实现：四类严格快照校验及自动纳入；原有可选 done/completedAt 兼容，不给旧记录补造时间；`syncScopeVersion=2` 在本机事务重置一次游标，补拉旧客户端曾跳过的记录。重复日志按绑定版本跳过；墓碑保持，旧 ID 不复活。连接仍在页尾，没有另建业务界面。第一批已转换随笔和目标保留本机，不拆开上传。

## 调用链与修改位置

`App.vue/saveTasks`（沿用）→ `useSyncWorkbench`（沿用）→ `syncStore.save/activateOwnerPhone/prepare` → `syncEngine.run` → `syncApi.send/changes` → REST `service.sync` → `domain.syncSchema/syncItem` → `D1Store`。

- `src/sync/syncPolicy.js`：支持范围、检查点版本。
- `src/sync/syncStore.js`：范围升级重拉与转换暂缓；原绑定、不可变请求和冲突不重建。
- `src/sync/syncApi.js`：范围校验说明。
- `services/workbench-api/src/domain.js`：四类字段和可选完成状态，仍经原 v2 校验。
- `src/sync/ownerPhone.js`、`src/components/SyncSettings.vue`：手机可见版本和准确范围说明。
- `tests/categorySync.test.js`：SQLite + REST + IndexedDB 联测；`nodeOne.test.js`、`syncWorkbench.test.js` 更新旧范围预期，保留原验证目的。

## 第一批证据

- 根目录 `npm test`：96 pass / 0 fail，退出 0。覆盖四类纳入、改名、完成/恢复、删除、回执丢失重试、云端更新拉回；旧游标补拉、墓碑、可选字段兼容、冲突保留双方。
- 测试使用隔离 SQLite 和虚构身份，不向线上反复写数据。真实手机新分类往返尚待本轮两批完成后合并验收；真断网和关应用后台同步仍未验证。
- 服务测试、构建及每次 Worker/Pages 发布结果见本轮交付回报。节点一手机可用是旧证据，不算新分类验收。

## 备份、回滚与参考

改动前检查点：`C:\Users\lenovo\AppData\Local\Temp\workbench-categories-cbad0728315741dbb6f71590d0fd0870`，含源码、测试、文档、哈希清单和原工作区 patch。代码回滚使用对应批次的正常 revert，不 reset 学习修改、不清空本机或云端数据。回滚不等同撤销已同步数据。

参考 [Apache CouchDB 复制协议](https://github.com/apache/couchdb/blob/main/src/docs/src/replication/protocol.rst)：过滤范围变化不能盲用旧检查点；复用版本与删除标记。参考 [Cloudflare D1 官方实现指引](https://github.com/cloudflare/skills/blob/main/skills/cloudflare/references/d1/api.md)：关联写入复用事务批处理，不引入新同步框架。

## 第一批实际发布

- commit `eee30097c0ce931a9f1725eb7d65020e2a847918`，main 正常 Push。
- Worker `766ab0b3-43f0-43fb-a6e5-9ffbb75f59ca`，部署退出 0；没有迁移数据库或新增资源。
- Pages 运行 `40338277702` 成功；公开网页 HTTP 200，实际脚本 `index-Ba8AhPpL.js` 包含 `2026.10.26.2`。
- 前端 96/96，服务 23/23，build/check 退出 0。没有线上测试写入。

## 第二批：完整范围与关联一致性

- `syncPolicy.js` 升级范围版本为 3，加入日常持续、重要日和转换随笔。`syncStore` 每次范围升级只重置一次游标，并清理旧的未完成拉取暂存，绑定/请求/墓碑保持。
- 所有手机支持分类沿用有效授权自动纳入；旧转换的目标如果已由节点一上传且内容一致，复用原 ID/版本，不生成第二条。
- `linkedIds` 从当前内容和已确认基准构造关联组，解除关联和删除也保留分组。`prepare` 将整组内容、版本及统一 requestId 落盘；结果不明先重放旧请求，不能替换内容。
- 新 `POST /api/sync/batch` 使用现有 D1 batch。回执的条件插入一次检查全部版本和删除依赖；事项、墓碑、变更日志及回执在同一事务中执行。任何 SQL 失败回滚整组；版本不匹配整组零写入。无需数据库迁移。
- 分页先暂存到 IndexedDB，持有固定高水位；完整收齐后一次合并并执行原 v2 关联校验。中断重开继续暂存游标，不向首页暴露半组。已删除目标不复活。
- 冲突组保存双方与基准；采用云端时保留关联完整的本机副本，重映射副本之间的 ID 并禁止自动再上传。未知结果重试内容不变；明确被拒绝后修改则整组撤销被拒请求。
- 维持单请求 64 KiB、关联组 32 条的限制；超限或关联到明确隔离测试记录/本机保留副本时保留原文并提示，不拆成部分成功。
- 八类 v2 字段原样保留；日常持续和重要日没有勾选完成语义。没有变更项目历史生成规则、原导出格式或学习修改。

## 网页、服务和 MCP 对应表

| 操作 | 原网页/业务 | 服务入口 | MCP |
| --- | --- | --- | --- |
| 八类列表/单条读取 | 原首页列表 | `list` / `getItem` | `list_items` / 新增 `get_item` |
| 八类创建 | 原快速记录、各类新增入口及工厂 | `create` | 原 `create_item` 已支持八类，保留 |
| 普通名称、标签、优先标记 | 原本机已有可编辑字段 | `patchItem`；urgent 仅待办、targetDate 仅重要日 | 新增 `update_item` |
| 项目详情与项目状态 | `updateProject` | `updateProject` | 原 `update_project` 保留 |
| 待办、随笔、等待中、购物、娱乐创作完成/恢复 | 原完成规则 | `completeItem` / `setCompletion` 明确 done=true/false | 新增 `set_item_completion`，重复请求不 toggle |
| 单条删除 | `removeItem`，删除目标解除随笔关联但保留原文 | `deleteItem`，版本墓碑及回执 | 新增 `delete_item` |
| 随笔转换 | 原 `convertNote`；目标为待办、项目、重要日、等待中、购物、娱乐创作 | 新 `convertNote` / `POST /api/notes/convert`，复用原函数和原子 store 批次 | 新增 `convert_note` |

MCP 不为日常持续或重要日强加完成/恢复；项目用原 `update_project.status`。普通事项实际内容字段仍为原 title，没有新增一套正文格式。转换不包含日常持续或随笔目标，遵守现有业务语义。

所有新增写工具保持所有者认证、read/write scope、先读 expectedVersion、requestId 重试及用户确认要求；冲突不覆盖。原工具 `content + structuredContent + outputSchema` 包装和 OAuth 返回格式不改，也不新增诊断工具。工具目录从 5 项增加为 10 项。

## 第二批学习入口

- `src/sync/syncStore.js`：`prepare`、`acknowledge`、`block`、`applyChanges`、`resolveWithCopy` 是关联组生命周期；保存仍经过原 `App.vue/saveTasks`。
- `src/sync/syncApi.js`：批次回执逐项核对；分页关联校验延后到完整本机事务，原字段不删除。
- `src/sync/syncEngine.js`：批次冲突完整读取、恢复固定高水位、原请求补传。
- `services/workbench-api/src/domain.js`：八类严格快照、批次/转换输入结构。
- `services/workbench-api/src/service.js`：`syncBatch`、`convertNote`；`store.js/syncBatch` 实际原子 SQL。
- `services/workbench-api/src/mcp.js`：新增工具定义，全部复用服务层；`http.js` 增加两个 POST 入口。
- `CloudConnection.vue`、`SyncSettings.vue`、`cloudAuth.js`：仅供所有者的云端说明、访客纯本机状态；入口仍页尾默认收起。
- `tests/categorySync.test.js`、服务 `test/http.test.js` / `worker.test.js` / `mcp-fixture.js`：隔离队列、真实 MCP SDK 和 workerd 验证链。

## 第二批验证层级与尚未验收

自动测试：根 `npm test` 最终 108 pass / 0 fail；服务 `npm test` 24 pass / 0 fail，退出均 0。`npm run build` 与服务 `npm run check` 退出 0。新增覆盖八类操作、旧检查点、批次重试、并发准入、SQL 失败整组回滚、分页面中断、旧转换接续、发送期间再修改、关联冲突副本及无授权访客。真实 MCP SDK 运行全部新增操作，并通过同款同步引擎验证数据自动拉回；workerd/D1 验证批次和 MCP 明确完成。所有这些数据均为隔离夹具，不是线上手机证据。

真实浏览器：原生 Edge 独立 localhost 4372 预览无所有者授权，原首页直接保存虚构随笔成功；刷新并点击“更新应用”后原记录仍在，底部版本 `2026.10.27.1`，仅显示本机/所有者入口，无访客待同步催促。该标签和预览进程已自行关闭。没有让用户处理未知测试页。

待真实验收：新工具刷新后的真实 ChatGPT 操作→手机自动变化，以及剩余分类在用户手机上的往返。不能用 SDK 或网页 API 通过代替。真断网和关闭应用后后台同步仍未验证，不要求断开热点。

合并手机步骤：更新正式页面到 `2026.10.27.1`，保留现有连接，原有六类记录自动纳入。任选一条虚构随笔转换为待办，确认原文和目标都在且没有重复；在 ChatGPT 设置→应用→Personal Workbench Test 的工具页执行“刷新工具”，确认新增五项，无需重建 OAuth。使用唯一指定的虚构待办，先读取 ID/version，经确认后明确完成；手机保持页面打开等待自动变化，不点上传或重新读取。真实结果另记，不将步骤当成已经完成。

发布前复核免费限制：按 [D1 官方限制](https://developers.cloudflare.com/d1/platform/limits/) 使用批量读取与参数化 JSON 准入，避免 32 条组超过单语句 100 参数或免费调用 50 查询。新增 32 条组创建/删除回归通过，未升级付费方案。
