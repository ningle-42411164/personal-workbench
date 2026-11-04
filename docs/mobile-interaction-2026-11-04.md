# 手机端交互调整 · 2026.11.04.1

## 阅读入口

- src/App.vue 负责首页分类、表单与编辑退出。moveRow、pinRow、sendBack 经首页已有的 saveTasks 保存，成功后同步队列按原方式提交。仅展开、切换卡片或进入排序不产生业务写入。
- src/components/SortToggle.vue、SortList.vue 和 src/data/itemOrder.js 管理排序入口、触屏手势与组内次序。左侧手柄直接拖动，整行长按抓起。拖动期间才抑制页面滚动。取消拖动时恢复原次序。
- src/components/ImportantDateDeck.vue 按实际数量渲染单卡、双卡或叠卡。src/components/SyncSymbol.vue 根据连接与队列状态显示图标和说明。
- src/components/OrdinaryItem.vue 负责名称草稿和退回随笔入口。src/components/ProjectCard.vue、ProjectDialog.vue、ProjectDetail.vue 负责弹窗内字段与提示。
- src/data/workbenchData.js 校验备份及原转换关联。退回随笔沿用待办 ID，历史源随笔仍指向同一条记录。
- services/workbench-api/src/domain.js、service.js、store.js 校验同步记录、目标类型和版本，并在创建或更新项目时计算排序位置。此次无数据库迁移或 MCP 工具目录变更。
- tests/mobileOrder.test.js、tests/categorySync.test.js 覆盖分组排序、旧记录、退回关联、隔离客户端同步、冲突与重试。

## 验证边界

工作区前端 124 项和 Worker 24 项通过，生产构建及 Worker 打包通过。隔离 Edge 触屏模拟覆盖单卡、双卡、3/6/8 张轮换、长标题、长按与手柄拖放、边缘滚动、提前滑动及取消。真实手机手感、输入法及跨设备排序仍由手机验收。隔离数据不进入线上。

更新后在已有数据上核对首页顺序、项目预览与提示、同步图标及重要日数量布局；在可调整的事项上核对分类内排序、置顶、退出排序和刷新保序。用虚构待办核对退回随笔，保留真实事项。

拖拽事件与回退模式参考 [SortableJS](https://github.com/SortableJS/Sortable)。Vue 中由应用持有列表顺序的做法参考 [vue.draggable.next](https://github.com/SortableJS/vue.draggable.next)。仅使用 SortableJS 绑定现有保存流程。

## 2026.11.04.2 增补

原七个排序分类共用右侧置顶按钮，日常持续与已完成区沿用原交互。待办依次按急需处理、普通置顶、未置顶排列；项目仍按暂停状态与置顶分四组。排序期间点击箭头经 SortList → App.pinRow → togglePin/frontRank → saveTasks → 原同步队列；不会生成新事项。旧 urgent 待办直接推导有效置顶。单独撤销紧急保留置顶，明确撤销置顶则同时撤销紧急。

快速记录的默认复选框为“录入待办”，显式分类仍写 priority。QuickHelp 独立管理提示的焦点、触屏开关、外部点击及 Escape；草稿由首页持有。普通事项急需标签位于标题内，可自然换行。重要日仅接入原排序面板的置顶事件，本次没有改卡片配色或尺寸。

隔离测试使用两套 IndexedDB 和本地 D1，验证七类跨端拉取、失去回执后重试、旧紧急记录和两种取消操作。320px Edge 验证桌面 hover/焦点/Escape、模拟触屏两次点击及点外部、草稿保留、置顶点击区、重开保序。真实手机需在自动同步栏确认本版本后验收。
