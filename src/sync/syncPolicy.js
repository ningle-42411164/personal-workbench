// 范围变化时升级检查点：旧游标可能已跳过这些分类，必须从变更日志重新读取。
export const SYNC_SCOPE_VERSION = 3;
export const SYNC_TYPES = ['todo', 'project', 'note', 'waiting', 'shopping', 'creation', 'routine', 'importantDate'];
export const syncSupported = item => SYNC_TYPES.includes(item.type);

// 当前值与已确认基准都参与连通分组，删除目标/解除关联也不能拆成两次独立提交。
export function linkedIds(id, items) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) if (item?.convertedToId && (ids.has(item.id) || ids.has(item.convertedToId))) {
      for (const key of [item.id, item.convertedToId]) if (!ids.has(key)) { ids.add(key); changed = true; }
    }
  }
  return [...ids];
}
