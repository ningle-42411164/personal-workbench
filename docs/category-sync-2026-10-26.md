# 剩余分类同步实施记录

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
