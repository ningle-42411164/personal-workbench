import { COMPLETABLE_TYPES } from './workbenchData.js';
import { isKnownTestRecord } from '../sync/knownTestRecords.js';

export const typeLabels = { todo:'一次性待办', note:'随笔', project:'项目', routine:'日常持续', importantDate:'重要日', waiting:'等待中', shopping:'购物', creation:'娱乐/创作' };
export const isCompletedItem = item => item.type === 'project' ? item.status === 'done' : COMPLETABLE_TYPES.includes(item.type) && Boolean(item.done);
export function searchItems(items, query, completedOnly = false) {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) return [];
  return items.filter(item => !isKnownTestRecord(item.id) && (!completedOnly || isCompletedItem(item))
    && [item.title, ...(item.tags ?? [])].some(value => String(value ?? '').toLocaleLowerCase().includes(keyword)));
}
export const itemStateLabel = item => isCompletedItem(item) ? '已完成' : item.type === 'project' && item.status === 'paused' ? '暂停中'
  : item.type === 'project' || COMPLETABLE_TYPES.includes(item.type) ? '未完成' : '';
