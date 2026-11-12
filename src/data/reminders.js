import { isCalendarDate, daysUntil } from './workbenchData.js';

// 业务状态随事项同步；展示冷却完全独立，仅属于当前浏览器。
export const activeReminder = item => item?.type === 'todo' && !item.done && item.reminder?.state === 'active';
export const canEditReminder = item => !item.done && (item.type === 'waiting' || item.type === 'todo' && Boolean(item.reminder?.enteredAt));
export function validateReminder(item) {
  const r = item.reminder;
  if (r === undefined) return;
  const stamp = v => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
  if (!r || Array.isArray(r) || Object.keys(r).sort().join(',') !== 'date,enteredAt,state,triggerDate' ||
      !['waiting','todo','note'].includes(item.type) || !['scheduled','active','stopped'].includes(r.state) ||
      !(r.date === null || isCalendarDate(r.date)) || !(r.enteredAt === null || stamp(r.enteredAt)) ||
      !(r.triggerDate === null || isCalendarDate(r.triggerDate)) || ((r.enteredAt === null) !== (r.triggerDate === null)) ||
      r.state === 'scheduled' && (item.type !== 'waiting' || !r.date || r.enteredAt || item.done) ||
      r.state === 'active' && (item.type !== 'todo' || !r.date || !r.enteredAt || item.done) ||
      item.type === 'waiting' && r.enteredAt || item.type === 'note' && (r.state !== 'stopped' || r.date !== null)) throw new Error('提醒日期或状态格式不正确。');
}
export function stopReminder(item, clearDate = false) {
  return item.reminder ? { ...item, reminder: { ...item.reminder, state:'stopped', ...(clearDate ? {date:null} : {}) } } : item;
}
export function setReminderDate(item, date, now = new Date().toISOString()) {
  if (!canEditReminder(item)) throw new Error('此事项不能设置提醒。');
  date = date || null;
  if (date !== null && !isCalendarDate(date)) throw new Error('请选择有效的提醒日期。');
  if ((item.reminder?.date ?? null) === date) return item;
  const reminder = { date, enteredAt:item.reminder?.enteredAt ?? null, triggerDate:item.reminder?.triggerDate ?? null,
    state:date ? item.type === 'waiting' ? 'scheduled' : 'active' : 'stopped' };
  return {...item, reminder, updatedAt:now};
}
// 首次转换只保留云端基准内容和明确的提醒参数；之后的改名/完成等继续按版本提交。
export function initialReminderSnapshot(base, target) {
  if (base?.type !== 'waiting' || base.done || !target?.reminder?.enteredAt || !isCalendarDate(target.reminder.triggerDate)) throw new Error('不支持的提醒转换。');
  return {...base, type:'todo', urgent:false, done:false, completedAt:null, updatedAt:target.reminder.enteredAt,
    reminder:{date:target.reminder.triggerDate, triggerDate:target.reminder.triggerDate, enteredAt:target.reminder.enteredAt, state:'active'}};
}
export function applyDueReminders(items, now = new Date(), skipIds = []) {
  const skip = new Set(skipIds), moved = new Set();
  let next = items.map(item => {
    if (skip.has(item.id) || item.done || item.type !== 'waiting' || item.reminder?.state !== 'scheduled' || daysUntil(item.reminder.date, now) > 1) return item;
    moved.add(item.id);
    return initialReminderSnapshot(item, {reminder:{enteredAt:now.toISOString(), triggerDate:item.reminder.date}});
  });
  if (moved.size) next = next.map(item => moved.has(item.convertedToId) ? {...item, convertedToType:'todo', updatedAt:now.toISOString()} : item);
  return next;
}
export const compareReminders = (a,b) => a.reminder.enteredAt.localeCompare(b.reminder.enteredAt) || a.id.localeCompare(b.id);
export const reminderText = (item, now = new Date()) => {
  const days = daysUntil(item.reminder.date, now);
  return days > 1 ? '还有 ' + days + ' 天' : days === 1 ? '明天' : days === 0 ? '今天' : '已过 ' + (-days) + ' 天';
};
export function createReminderQueue({storage, now = () => Date.now()} = {}) {
  const key='personal-workbench.reminder-shown.v1';
  let shown = {}, queue = [], current = null;
  try { const saved=JSON.parse(storage.getItem(key) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) shown=saved; } catch { /* 不覆盖业务数据。 */ }
  const token = item => item.id + ':' + item.reminder.enteredAt;
  function advance(items) {
    const eligible = new Map(items.filter(activeReminder).map(item=>[item.id,item]));
    if (current && eligible.has(current)) return eligible.get(current);
    current=null;
    while(queue.length) {
      const item=eligible.get(queue.shift());
      if (!item) continue;
      const time=now(), last=shown[token(item)];
      if (typeof last === 'number' && time-last < 3600000) continue;
      shown[token(item)] = time;
      try { storage.setItem(key,JSON.stringify(shown)); } catch { /* 存储受限时本次会话仍遵守冷却。 */ }
      current=item.id; return item;
    }
    return null;
  }
  return {
    open(items) { queue=items.filter(activeReminder).sort(compareReminders).map(x=>x.id); return advance(items); },
    reconcile:advance,
    acknowledge(items) { current=null; return advance(items); },
  };
}
