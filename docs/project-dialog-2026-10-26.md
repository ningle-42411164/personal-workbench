# 本机项目详情弹窗与项目编辑保护

本批只改本机项目详情，不依赖云端，不改变 schemaVersion 2、事项键或备份格式。不扩展普通事项、新增表单或完整同步。1B 手机写授权暂缓，写入闭环未验收；Worker 阶段诊断源码仅保存，未部署。

## 实现与调用链

| 文件 | 实际入口与职责 |
| --- | --- |
| `src/App.vue` | selectedProject 从完整 items 取得；列表外唯一 ProjectDialog。saveProject 保留先保存再更新，不再因项目完成/恢复改变分组而提前卸载编辑器 |
| `src/components/ProjectDialog.vue` | Teleport + 原生 dialog.showModal，居中、遮罩、背景隔离、焦点与滚动锁；requestClose 先调用 saveBeforeLeave，成功才关闭；Esc 取消默认关闭后走同一检查 |
| `src/components/ProjectDetail.vue` | 复用原字段、历史、标签、完成与删除入口；调用编辑协调器，保存后 nextTick 等父级新 props 再继续操作，避免旧记录覆盖刚保存的字段 |
| `src/data/projectEditor.js` | createProjectEditor；begin 同字段只聚焦、换字段先 commit；commit 失败保留 field/draft/error；cancel 仅主动放弃；complete 先提交字段再基于最新项目保存完成状态 |
| `src/style.css` | project-dialog 顶层卡片，max-height 适配动态视口和安全区、内部滚动、窄屏单列；原列表不挂载详情 |
| `tests/projectEditor.test.js` | 无变化不写、历史只追加一次、失败阻止离开、无效字段/存储异常、主动取消、并发离开、完成前保存 |

点击本机项目 → App.selectedProject → ProjectDialog → ProjectDetail.beginEdit → projectEditor.begin/commit → updateProject → App.saveProject → saveTasks → writeWorkbenchData → 新项目传回 props → 才切字段/关闭/完成。原生模态阻止直接点击背景列表；关闭后可以再打开另一项目。

## 已确认的行为

- 同字段再次点击只聚焦，不从正式记录重置草稿。
- 切字段、×、遮罩、Esc、完成及删除前，先保存当前有效修改；成功才继续，失败保留输入与编辑状态，不弹出多选离开确认。
- 现有完成和删除确认保留。主动点字段“取消”只丢弃该字段尚未提交的内容，不撤销此前自动保存的其他字段。
- 无实际变化沿用 updateProject 返回原对象，不写入、不新增历史；只有实际 currentSituation 变化追加历史。
- 保存失败在卡片内提示，恢复保存条件后可重试；正在保存时禁用输入，避免保存中再次修改后被清空。
- 刷新后恢复未保存草稿暂缓，不纳入本批验收。普通事项及新增表单保护仍待单独实施。

## 验证分层

| 场景 | 状态与证据 |
| --- | --- |
| 桌面居中、背景遮罩、列表不撑开 | 隔离生产预览实际通过；1063×646 时中心误差小于 1px，项目列表高度保持 177.53px，详情不在列表内 |
| 375px 窄屏、长内容内部滚动 | 浏览器可视区模拟通过：375×740、卡片约 347×708，中心误差小于 1px，无横向溢出、body 滚动锁定。不是手机真机验证 |
| 同字段不重置、切字段自动保存 | 隔离页面实际通过，currentSituation 只追加一次历史 |
| ×、遮罩、Esc 保存后关闭，主动取消 | 隔离页面实际通过，重新打开核对已保存值与被取消值 |
| 保存失败阻止关闭/切换/完成 | 隔离页模拟该 origin 的 localStorage.setItem 故障，实际确认卡片仍打开、字段与输入保留；×、Esc、换字段及完成均阻止。故障注入随后已恢复，重试保存成功；未操作正式 origin 的数据 |
| 无变化、坏日期、存储异常、完成前保存和并发离开 | 专项自动测试通过；原业务/备份/启动偏好回归及生产构建通过 |
| 完成及恢复的浏览器闭环 | **待人工验收**。完成测试到达原生确认框后，电脑控制因无法可靠核对浏览器地址而停止；未取得确认后的结果，不能写通过 |
| 华为手机浏览器、桌面入口、软键盘/横屏 | **待人工验收**，使用下方公开 Pages 地址，不要求用户操作隔离页 |

此前测试地址未提供给用户，不再要求用户查找或处理该会话。已停止本轮启动的本机预览服务；不绕过电脑控制工具的地址校验，失联测试会话不再阻塞提交发布。

## 手机公开验收入口

完整地址：<https://ningle-42411164.github.io/personal-workbench/>。从手机浏览器或原桌面入口打开；若有“更新应用”先更新，再整页重开。保持本机数据模式，无需云端授权。确认新版的方法：点击项目后出现居中遮罩卡片，顶部为“项目详情”，并有“修改后切换字段或关闭会先保存；保存失败时保留输入。点‘取消’只放弃当前未提交修改。”提示。旧版是列表内展开，不具备此卡片。

建议用本机虚构项目验收：打开并滚动长内容 → 修改当前情况、再次点同字段、点下一步 → × 关闭再打开核对 → 再次修改并点遮罩关闭核对 → 输入后主动取消核对未保存 → 修改当前情况后点标记完成并确认 → 展开已完成，打开同一项目，状态改为进行中并保存 → 关闭后确认回到项目列表，文字/标签/历史仍在。浏览器和手机桌面入口分别验证，未做的步骤保持待验收。

## 发布边界与参考

本批正常提交到 main 并 Push，沿用现有 Pages 工作流（测试→构建→Pages）。不运行 wrangler deploy，不触及 D1、KV 或 GitHub OAuth App。此前 `15f1289` 是暂停排查的源码检查点，随 Git 历史 Push 不等于 Worker 已部署。

参考：[Vue 官方 Teleport 模态示例](https://github.com/vuejs/vitepress/blob/main/docs/components/ModalDemo.vue)、[W3C 模态对话框实践](https://github.com/w3c/aria-practices/tree/main/content/patterns/dialog-modal)。结论：复用现有详情与保存链，外壳独立于列表；键盘关闭、焦点和背景隔离与保存检查一起处理。
