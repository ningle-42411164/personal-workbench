# 手机交互与随笔移动 · 2026.11.05.1

## 保存与显示

| 文件 | 阅读入口与作用 |
| --- | --- |
| src/App.vue | 创建、编辑、排序、置顶、退回、完成和删除各自在 saveTasks 成功后发出对应消息。locateCompleted 复核 ID 和类型，先处理正在编辑的草稿，再渲染、滚动和强调完成行。 |
| src/components/SuccessMessages.vue | push 生成独立 ID 和两秒计时器。TransitionGroup 淡出且清理，只有完成条目能触发定位；支持原生 dialog 顶层。 |
| src/components/ProjectCreate.vue、SortList.vue | 定位复用新增项目已有的取消保护；排序模式保留消息点击。 |
| src/components/QuickHelp.vue、ProjectDialog.vue | 共享唯一内容 ID、信息图标和白底说明。详情使用三行文本，浮层在 dialog 内。 |
| src/components/PinnedMark.vue、OrdinaryItem.vue、ImportantDateDeck.vue | 浏览行复用 isPinned，包括旧 urgent 待办。重要日前卡和标题条共用原渐变，边框宽度保留。 |
| src/style.css、src/sync/ownerPhone.js | 暂停项目文字、定位强调、标题提示间距和发布版本。 |

## 一条记录如何移动

首页 saveNoteConversion → workbenchData.moveNote → saveTasks → syncStore.save 在同一本机事务内保存目标记录并标为待同步。moveNote 按目标类型初始化字段，保留原 ID、创建时间、标题、标签和已有标记，重新计算目标分类内的位置。历史关联的源或目标继续受关联保护。

同步引擎 prepare → syncApi.send → Worker。syncStore.syncEntry 为新移动持久化 moveFrom、expectedVersion、requestId 和不可变快照。domain.syncItem 重新构造并校验纯移动的字段。若离线期间又编辑了目标，先确认纯移动，再按新版本提交后续改动。回执丢失沿用原请求；竞争写入进入原冲突机制。

HTTP POST /api/notes/convert 和 MCP convert_note 的新调用明确传 mode=move。service.convertNote 返回 records 数组，内含一条原 ID 的目标。无 mode 的调用保留原来两条记录的协议和回执指纹，旧单条/批次 outbox 不重写。store.syncBatch 用版本和历史引用条件约束 D1 事务。MCP 只需刷新现有应用工具目录一次。

## 验证与回退

tests/categorySync.test.js 使用隔离 IndexedDB、D1、HTTP 与 MCP SDK，覆盖失去回执、重试、冲突、非法目标、事务失败、后续编辑、删除和历史回执。浏览器检查包含强制本机保存失败、五条并发显示、不同时间到期、同名事项定位、保存失败阻止离开、项目定位、窄屏提示和重要日几何。真实手机及真实 ChatGPT 本版移动留待所有者验收。

前端可按提交反向发布；有新版待同步请求时保留能处理新旧协议的 Worker，避免旧服务拒绝原请求。回退代码不会撤销已经完成的业务移动。无数据库迁移或历史清理。
