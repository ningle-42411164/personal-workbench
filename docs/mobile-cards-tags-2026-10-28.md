# 手机卡片及快速标签 2026.10.28.1

ProjectCard.vue 共用原生 dialog、模态焦点恢复和遮罩起止判定。标题栏不滚动；关闭符号 32px、点击区域 48px，独立背景和留白。正文内部滚动，卡片宽度手机两侧各 20px，默认高度上限 78dvh。visualViewport 变化调整高度及中心位置；真实输入法效果待所有者验收。

ProjectDialog 继续调用 ProjectDetail.saveBeforeLeave，成功再关闭，失败保留输入。ProjectCreate 保留字段顺序及学习注释，所有关闭入口有输入先确认放弃；失焦不创建，保存失败保留，成功才关闭。创建仍 createProject → App.createFullProject → saveTasks → 原事务与同步。

App.addTask 将 normalizeUserTags(quickTags) 写入原工厂产生的事项；更多选项中多选已有标签，独立摘要明确本次保存标签。收起及切换类型保留标签；其他原重置规则不变；失败保留、成功清空。项目和普通事项复用原标签显示，重要日新增显示。没有手动创建标签或改旧事项。

参考：https://github.com/w3c/aria-practices 的模态对话框焦点及键盘关闭约定。其他叉号未调整，本轮仅两类项目卡片统一。

修改前备份：C:\Users\lenovo\AppData\Local\Temp\workbench-mobile-89caa73942814982a608de2cbaeeeabc。回滚本批提交即可，不能重置原有未提交学习修改。Worker、认证、MCP、历史规则未改。

验收：更新到 2026.10.28.1；打开短/长项目，确认留白、正文滚动及叉号常驻；编辑后关闭验证保存。新增项目输入后分别取消关闭/拒绝放弃，确认输入保留；确认放弃后再建一条空名称项目检查兜底。弹键盘检查底部字段及保存可访问。快速记录选择两标签，收起及换类型检查摘要；分别保存普通事项、项目和重要日检查标签。真实手机及输入法待验收；本轮未执行模拟浏览器交互，不把构建/单元测试代替视觉通过。
