# 2026-11-09 单条同步拒绝只读诊断

版本 2026.11.09.1。根因仍待手机已保存的错误码与事项 ID 核对，不能以同名云端记录推断。

## 修改与调用链
- SyncSettings.vue：rejected 单独提示，原生 details 展开只读信息；拒绝状态不提供版本覆盖选择。已有 conflict 版本选择保留。
- rejectionDetails.js：从 snapshot.blocked、outbox（含关联组）、bindings 和 data 投影明确字段。无网络、无持久化、无请求改写，不展示凭据或整份状态。
- ownerPhone.js：仅更新可识别版本。

原有事项、冲突副本、dirty/outbox/requestId 均保留。没有 Worker 或数据迁移。此补丁修正诊断入口，尚未解决手机请求被拒绝的实际原因。

## 验证
npm test：130 pass，0 fail；npm run build：成功。
隔离 Edge 360px：详情开关、已保存错误码、长 ID 不溢出、snapshot/outbox 不变、无操作事件、拒绝无覆盖选项、正常冲突仍可选择。测试最初跨 Vue 实例动态改变场景等待超时，改用独立加载拒绝/冲突快照后通过。未验证真实手机。

## 下一步
手机更新后展开「心理课论文」的「查看拒绝详情（只读）」，核对错误码、事项 ID、请求 ID、预期版本、原请求/绑定分类及创建时间。按 ID 读取云端后确定根因；不重放历史写请求。

备份 C:\Users\lenovo\AppData\Local\Temp\workbench-rejection-20261109-150455。回滚仅撤销本补丁提交并重新发布，不能清除用户浏览器数据。
