// 范围变化时升级检查点：旧游标可能已跳过这些分类，必须从变更日志重新读取。
export const SYNC_SCOPE_VERSION = 2;
export const SYNC_TYPES = ['todo', 'project', 'note', 'waiting', 'shopping', 'creation'];
export const syncSupported = item => SYNC_TYPES.includes(item.type) && !item.convertedToId;
