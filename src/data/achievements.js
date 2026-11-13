// 本机元数据，与事项、队列共用一次事务，但不进入 data.items 或任何云请求。
import { COMPLETABLE_TYPES, validateWorkbenchData, isCalendarDate } from './workbenchData.js';

export const ACHIEVEMENTS = Object.freeze([
  { id:'rapid', name:'我去你咋这么牛逼', condition:'滚动60秒内成功完成5条不同待办', icon:'bolt' },
  { id:'clean', name:'桌面清理大师', condition:'滚动60秒内成功删除10条不同待办', icon:'brush' },
  { id:'old', name:'压箱底终结者', condition:'成功完成一条创建满30天的待办', icon:'archive' },
  { id:'daily', name:'事项处理达人！', condition:'本地同一天成功完成10条不同事项', icon:'trophy' },
  { id:'order', name:'调序大师', condition:'同一分类的一次排序模式中成功移动10个不同事项', icon:'sort' },
]);
const clone = value => structuredClone(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const ids = value => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0) && new Set(value).size === value.length;
export const localDay = time => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const emptyAchievements = () => ({ version:1, unlocked:{}, completedTodoIds:[], deletedTodoIds:[], completionWindow:[], deletionWindow:[], day:{ date:'', ids:[] }, sorting:null });

export function validateAchievements(value) {
  const fail = () => { throw Error('成就存档格式无效，原事项与成就保持不变。'); };
  if (!plain(value) || value.version !== 1 || !plain(value.unlocked)) fail();
  if (Object.keys(value).some(key => !Object.keys(emptyAchievements()).includes(key))) fail();
  for (const [key,time] of Object.entries(value.unlocked)) if (!ACHIEVEMENTS.some(a=>a.id===key) || !validTime(time)) fail();
  if (!ids(value.completedTodoIds) || !ids(value.deletedTodoIds)) fail();
  for (const key of ['completionWindow','deletionWindow']) {
    if (!Array.isArray(value[key]) || value[key].some(x=>!plain(x) || Object.keys(x).sort().join()!=='at,id' || !validTime(x.at) || typeof x.id!=='string' || !x.id) || new Set(value[key].map(x=>x.id)).size!==value[key].length) fail();
  }
  if (!plain(value.day) || Object.keys(value.day).sort().join()!=='date,ids' || !ids(value.day.ids) || !(value.day.date==='' || isCalendarDate(value.day.date))) fail();
  if (value.sorting !== null && (!plain(value.sorting) || Object.keys(value.sorting).sort().join()!=='category,ids,session' || typeof value.sorting.session!=='string' || !value.sorting.session || typeof value.sorting.category!=='string' || !ids(value.sorting.ids))) fail();
  return value;
}

// 只有 UI 明确标注的单目标操作才进入此处；快照监听、拉取、导入都不能调用发奖判断。
export function recordLocalAction(archive, before, after, action, time = new Date().toISOString()) {
  const effects = { unlocked:[], project:null };
  if (action?.source !== 'ui' || !['complete','delete','move'].includes(action.kind)) return { archive, effects };
  const old = before.find(x=>x.id===action.id), next = after.find(x=>x.id===action.id);
  if (!old) return { archive, effects };
  const done = x => x?.type==='project' ? x.status==='done' : x?.done===true;
  const completed = action.kind==='complete' && next?.type===old.type && !done(old) && done(next) && (old.type==='project' || COMPLETABLE_TYPES.includes(old.type));
  const deleted = action.kind==='delete' && old.type==='todo' && !next;
  const moved = action.kind==='move' && next?.type===old.type && action.category===old.type && action.session && (next.rank!==old.rank || next.rankTie!==old.rankTie) && next.pinned===old.pinned && next.urgent===old.urgent;
  if (!completed && !deleted && !moved) return { archive, effects };
  const state = clone(archive ? validateAchievements(archive) : emptyAchievements());
  const at = new Date(time).toISOString(), stamp = Date.parse(at);
  const unlock = id => { if (!state.unlocked[id]) { state.unlocked[id]=at; effects.unlocked.push(id); } };
  // 60秒边界包括恰好60秒，未来时间不参与当前窗口（设备时钟回拨）。
  for (const key of ['completionWindow','deletionWindow']) state[key]=state[key].filter(x=>stamp-Date.parse(x.at)>=0 && stamp-Date.parse(x.at)<=60000);
  if (completed) {
    if (old.type==='project') effects.project={id:next.id,title:next.title};
    if (state.day.date!==localDay(at)) state.day={date:localDay(at),ids:[]};
    if (!state.day.ids.includes(old.id)) state.day.ids.push(old.id);
    if (state.day.ids.length>=10) unlock('daily');
    if (old.type==='todo') {
      if (!state.completedTodoIds.includes(old.id)) { state.completedTodoIds.push(old.id); state.completionWindow.push({id:old.id,at}); }
      if (state.completionWindow.length>=5) unlock('rapid');
      if (stamp-Date.parse(old.createdAt)>=30*86400000) unlock('old');
    }
  }
  if (deleted) {
    if (!state.deletedTodoIds.includes(old.id)) state.deletedTodoIds.push(old.id);
    if (!state.deletionWindow.some(entry=>entry.id===old.id)) state.deletionWindow.push({id:old.id,at});
    if (state.deletionWindow.length>=10) unlock('clean');
  }
  if (moved) {
    if (state.sorting?.session!==action.session || state.sorting?.category!==action.category) state.sorting={session:action.session,category:action.category,ids:[]};
    if (!state.sorting.ids.includes(old.id)) state.sorting.ids.push(old.id);
    if (state.sorting.ids.length>=10) unlock('order');
  }
  return {archive:state,effects};
}

// 备份扩展字段在进入业务数据之前分离；旧备份不提供该字段便保留现有本机存档。
export function parseBackup(value) {
  const { achievements, ...data } = value ?? {};
  validateWorkbenchData(data);
  if (Object.hasOwn(value,'achievements')) validateAchievements(achievements);
  return {data, ...(achievements===undefined?{}:{achievements:clone(achievements)})};
}
export function exportBackup(data, archive) {
  return {...clone(validateWorkbenchData(data)), achievements:clone(validateAchievements(archive ?? emptyAchievements()))};
}
export function saveAchievementMetadata(state, previous, {importing, importedAchievements, localAction, actionTime} = {}) {
  if (importing) {
    if (importedAchievements!==undefined) {
      state.achievements=clone(validateAchievements(importedAchievements));
      state.achievements.sorting=null; // 导入不能延续另一页面/设备的拖动会话。
    }
    return {unlocked:[],project:null};
  }
  const result=recordLocalAction(state.achievements,previous.items,state.data.items,localAction,actionTime);
  if(result.archive) state.achievements=result.archive;
  return result.effects;
}
