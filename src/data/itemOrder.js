import { generateKeyBetween } from 'fractional-indexing';
// 旧待办可能只有 urgent。直接推导有效置顶，无须为读取旧数据创建同步操作。
export function isPinned(item) {
  return item.pinned === true || (item.type === 'todo' && item.urgent === true);
}
export function togglePin(item) {
  const next = { ...item, pinned: !isPinned(item) };
  if (item.type === 'todo' && item.urgent) next.urgent = false;
  return next;
}
export function subgroup(item) {
  if (item.type === 'project') return (item.status === 'paused' ? 2 : 0) + (item.pinned ? 0 : 1);
  if (item.type === 'todo') return item.urgent ? 0 : item.pinned ? 1 : 2;
  return item.pinned ? 0 : 1;
}
// 老备份按创建时间及稳定 ID 回退。手动排序只改 rank，不改业务时间或项目历史。
export const rankOf = item => item.rank ?? -Date.parse(item.createdAt);
const tieOf = item => item.rankTie ?? 'a0'+Array.from(item.id,c=>c.codePointAt(0).toString(16).padStart(6,'0')).join('')+'V';
const compareText = (a,b) => a<b?-1:a>b?1:0;
export function compareRows(a,b) {
  return subgroup(a)-subgroup(b) || rankOf(a)-rankOf(b) || compareText(tieOf(a),tieOf(b)) || compareText(a.id,b.id);
}
export function frontRank(items, item, now = Date.now()) {
  return items.filter(x => x.id !== item.id && x.type === item.type && subgroup(x) === subgroup(item)).reduce((v,x) => Math.min(v,rankOf(x)-1), -now);
}
export function moveRank(rows, from, to) {
  const current = rows[from];
  if (!current || !rows[to] || from === to || subgroup(current) !== subgroup(rows[to])) return null;
  const rest = rows.filter(x => x.id !== current.id);
  const left = rest[to-1], right = rest[to];
  const hasLeft = left && subgroup(left) === subgroup(current), hasRight = right && subgroup(right) === subgroup(current);
  if (!hasLeft) return {rank:frontRank(rows,current)};
  if (!hasRight) return {rank:rankOf(left)+1};
  const middle = rankOf(left)+(rankOf(right)-rankOf(left))/2;
  if (middle > rankOf(left) && middle < rankOf(right)) return {rank:middle};
  // 同毫秒创建或多次插入导致数字间距耗尽时，细分相邻位置，只写被拖动项。
  const upper = rankOf(left) === rankOf(right) ? tieOf(right) : null;
  return {rank:rankOf(left),rankTie:generateKeyBetween(tieOf(left),upper)};
}
export function returnTodo(items,id) {
  const old = items.find(x => x.id === id);
  if (old?.type !== 'todo' || old.done) throw new Error('只能退回未完成待办。');
  const {urgent, ...note} = old;
  note.type = 'note'; note.returnedFromTodo = true; note.rank = frontRank(items,note); note.updatedAt = new Date().toISOString();
  return items.map(x => x.id === id ? note : x);
}
