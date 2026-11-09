# 2026-11-09 页尾、搜索与三项界面调整

功能版本 2026.11.09.3。基线 95d5eb9（包含 79d8590 拒绝诊断与最新分类选择）。不修改 Worker、MCP、事项历史、同步协议或正式数据。

## 实际文件与调用链
- App.vue：页尾依次备份、启动动画、云端设置、全局搜索。设置使用本地显示状态，现有 CloudConnection/SyncSettings 继续挂载并保留全部真实操作。
- 导入：按钮触发现有文件输入 → chooseBackup / validateWorkbenchData → ProjectCard「导入备份确认」→ confirmImport → sync.save(..., { importing:true })。UI 根据 bindings 禁用确认，原事务内防线未变。失败在弹窗内保留文件、数据和错误；成功才关闭并通知。
- GlobalSearch.vue + data/searchItems.js：从 personalItems 全量名称/标签查询，复用已知测试 ID 隔离；区分项目 status 与普通完成字段。日常持续/重要日没有新增完成语义。
- App.locateSearch：真实 ID 查当前记录，直接展开对应分类；不调用 locateCompleted、flushOrdinary 或任何保存函数。普通编辑保持挂载；无法安全定位时提示先保存/取消。ImportantDateDeck.locate 仅选择显示的卡片，不更改顺序或数据。清空关键词重置已完成筛选。
- QuickHelp.vue：沿用交互与唯一 ID，实际测量边界决定方向和水平偏移；留在原 dialog 层级，浮层不占布局空间。
- CloudConnection/SyncSettings：移除常驻访客说明；只对已识别的同一次离线事件合并警告，授权错误、拒绝详情、版本选择、恢复建议及计数保留。纯显示适配，未改控制器状态机。
- App.vue/style.css：暂停标签在标题右侧，置顶在其右侧，下一步仍全宽；sans-serif 与表单控件继承；未调整既有字号/复选框。页尾和搜索使用本次专属规格。
- CategoryChevron.vue：Ant Design 官方 DownOutlined/UpOutlined 路径，14px，按展开状态切换，点击范围和 aria-expanded 不变；MIT 声明见 docs/licenses/ant-design-icons.txt。
- ownerPhone.js：仅更新显示版本。

## 验证层级
自动：npm test 137 pass / 0 fail；npm run build 成功；git diff --check 通过。
隔离真实 Edge：320/360px 页尾与Tooltip、名称/标签/同名ID、已完成、暂停、非当前重要日、日常提醒定位；编辑草稿与整份 IndexedDB 同步状态前后一致；长标题+多标签+暂停+置顶且下一步全宽；字体computed值和搜索16px；无效JSON/取消/失败/绑定拦截/成功导入。
完整应用模拟offline事件：重复离线警告合并，计数及检查连接保留。未断开所有者热点或网络。
暂存脚本位于 C:\Users\lenovo\AppData\Local\Temp\workbench-nov4-qa\footer-nov09.cjs、footer-nov09-320.cjs、footer-full-extra.cjs。
测试中修正：隔离ID最初取了不在名单里的历史记录，改为 KNOWN_TEST_IDS[0]；不修改隔离规则。拼装测试页面两次未加载且报告本地网络检查拦截，停止该方式，改在完整应用验证通过。完整应用计数断言最初同时命中页头与设置，限定设置区域后通过。
未验证：华为手机实际字形、输入法/浏览器字号设置下观感；由所有者统一验收。

## 参考
两份所有者本地预览均已读取，仅使用约定范围。图形来源 https://github.com/ant-design/ant-design-icons/tree/master/packages/icons-svg/svg/outlined ，按需内嵌，无新组件库/CDN。

## 备份与回滚
C:\Users\lenovo\AppData\Local\Temp\workbench-footer-search-20261109-152847 包含 baseline.zip 和 working.patch。回滚撤销本批提交并重新发布前端，不清理浏览器存储。本批未执行正式数据导入或写入。

## 合并手机验收
更新到 2026.11.09.3：查看页尾顺序，点三个 i、云端设置开关和导出/导入入口（已有绑定时仅查看禁用确认，取消即可）；检查手机字形、暂停长项目标题/标签/置顶与完整下一步；搜索名称/标签，分别跳转已完成、暂停项目、非当前重要日；正在编辑的草稿应保留。无需重新授权，不要求真断网。
