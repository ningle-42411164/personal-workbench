import { COMPLETABLE_TYPES } from './workbenchData.js';

export const isCompleted = item => item.type === 'project' ? item.status === 'done' : COMPLETABLE_TYPES.includes(item.type) && item.done === true;
export function sortedCompleted(items) {
  return items.filter(isCompleted).sort((a, b) => Number(b.favorite === true) - Number(a.favorite === true)
    || b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
}
export function completedBatchLimit(items, id, current = 10) {
  const index = items.findIndex(item => item.id === id);
  return index < 0 ? current : Math.max(current, Math.ceil((index + 1) / 10) * 10);
}
export function toggleFavorite(item, now = new Date().toISOString()) {
  if (!isCompleted(item)) throw new Error('只能在已完成事项中操作收藏。');
  // 保留置顶、完成时间和项目历史；收藏是独立的展示偏好。
  return { ...item, favorite: item.favorite !== true, updatedAt: now };
}
