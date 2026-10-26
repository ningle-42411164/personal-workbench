import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STORAGE_KEY, createNote, createTodo, createSimpleItem, createProject, createRoutine,
  createImportantDate, updateProject, toggleTodo, renameItem, convertNote, removeItem,
  readWorkbenchData, writeWorkbenchData, validateWorkbenchData, daysUntil,
} from '../src/data/workbenchData.js';
import { availableUserTags } from '../src/data/userTags.js';

// 用内存代替真实 localStorage：这些模拟不会读取、清空或覆盖浏览器里的个人记录。
function memoryStorage(initial = null) {
  let raw = initial;
  return { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
}
const at = '2026-09-26T08:00:00.000Z';
const dataOf = items => ({ schemaVersion: 2, items });

test('审查：完整生命周期保留分类、标签、完成时间和项目历史', () => {
  const storage = memoryStorage();
  let project = createProject('项目', { tags: ['学习', '代码'], nextStep: '' }, at);
  project = updateProject(project, { currentSituation: '第一次推进' }, '2026-09-26T08:01:00.000Z');
  project = updateProject(project, { currentSituation: '第二次推进', nextStep: '测试' }, '2026-09-26T08:02:00.000Z');
  project = updateProject(project, { status: 'done' }, '2026-09-26T08:03:00.000Z');
  const items = [createNote('随笔', at), createTodo('待办', false, at), project,
    createRoutine('日常', at), createImportantDate('重要日', '2026-09-26', at),
    ...['shopping', 'waiting', 'creation'].map(type => createSimpleItem(type, type, at, true))];
  const finished = items.map(item => ['todo', 'note', 'shopping', 'waiting', 'creation'].includes(item.type)
    ? toggleTodo({ ...item, tags: ['生活'] }, '2026-09-26T08:04:00.000Z') : item);
  writeWorkbenchData(dataOf(finished), storage);
  const backup = JSON.parse(JSON.stringify(readWorkbenchData(storage)));
  writeWorkbenchData(validateWorkbenchData(backup), storage);
  assert.deepEqual(readWorkbenchData(storage).items, finished);
  assert.equal(backup.items.find(item => item.type === 'project').updates.length, 3);
  assert.deepEqual(backup.items.filter(item => item.done).map(item => item.completedAt), Array(5).fill('2026-09-26T08:04:00.000Z'));
});

test('审查：损坏、空字符串和拒绝访问的存储均不会被读取函数覆盖', () => {
  for (const raw of ['', '{bad', 'null', '{"schemaVersion":1,"items":[]}']) {
    const storage = memoryStorage(raw);
    assert.throws(() => readWorkbenchData(storage), /读取失败/);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
  assert.deepEqual(readWorkbenchData(memoryStorage()), dataOf([]));
  assert.throws(() => readWorkbenchData({ getItem() { throw new Error('禁止访问'); } }), /禁止访问/);
});

test('审查：非法备份、重复 ID、写入失败不会改变已有内容；空数组是有效替换', () => {
  const item = createTodo('保留', false, at);
  const storage = memoryStorage();
  writeWorkbenchData(dataOf([item]), storage);
  const raw = storage.getItem(STORAGE_KEY);
  for (const invalid of [dataOf([null]), dataOf([item, item]), dataOf([{ ...item, completedAt: at }]),
    dataOf([{ ...item, title: ' '.repeat(3) }]), dataOf([{ ...item, title: '长'.repeat(151) }])]) {
    assert.throws(() => writeWorkbenchData(invalid, storage));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
  assert.throws(() => writeWorkbenchData(dataOf([]), { setItem() { throw new Error('QuotaExceededError'); } }), /Quota/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  writeWorkbenchData(dataOf([]), storage);
  assert.deepEqual(readWorkbenchData(storage), dataOf([]));
});

test('审查：删除最后一条、重复删除及随笔关联解除不会误删其他事项', () => {
  const note = createNote('想法', at);
  const other = createTodo('其他', false, at);
  const converted = convertNote([note, other], note.id, 'project', null, at);
  const target = converted.find(item => item.type === 'project');
  assert.throws(() => convertNote(converted, note.id, 'todo'), /重复转换/);
  const remaining = removeItem(converted, target.id, at);
  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].convertedToId, undefined);
  assert.deepEqual(remaining[1], other);
  assert.deepEqual(removeItem([other], other.id, at), []);
  assert.throws(() => removeItem([], other.id), /不存在/);
});

test('审查：连续完成是切换状态而非复制记录；改名保留全部属性', () => {
  const item = { ...createSimpleItem('shopping', '购物', at, true), tags: ['购物'], extra: '保留' };
  const finished = toggleTodo(item, '2026-09-26T08:01:00.000Z');
  const restored = toggleTodo(finished, '2026-09-26T08:02:00.000Z');
  const renamed = renameItem(restored, '新名称', '2026-09-26T08:03:00.000Z');
  assert.equal(renamed.id, item.id);
  assert.equal(renamed.type, 'shopping');
  assert.equal(renamed.done, false);
  assert.equal(renamed.completedAt, null);
  assert.equal(renamed.createdAt, at);
  assert.equal(renamed.priority, true);
  assert.deepEqual(renamed.tags, ['购物']);
  assert.equal(renamed.extra, '保留');
});

test('审查：1000 条事项及 200 条更新可保存、读取和导出；标签默认值与已有值合并', () => {
  const storage = memoryStorage();
  let project = createProject('历史', {}, at);
  for (let index = 1; index <= 200; index++) {
    project = updateProject(project, { currentSituation: `推进 ${index}` }, new Date(Date.parse(at) + index * 1000).toISOString());
  }
  const items = [...Array.from({ length: 1000 }, (_, index) => createNote(`记录 ${index}`, at)), project];
  items[0].tags = ['#Vue', 'Vue', ' Linux ', '学习'];
  writeWorkbenchData(dataOf(items), storage);
  assert.equal(readWorkbenchData(storage).items.length, 1001);
  assert.equal(JSON.parse(JSON.stringify(readWorkbenchData(storage))).items.at(-1).updates.length, 201);
  const options = availableUserTags(items);
  assert.equal(options.length, 14);
  assert.equal(options.filter(tag => tag === 'Vue').length, 1);
  assert.equal(availableUserTags([]).length, 12);
});

test('审查：重要日按本地日期计算当天、过期、跨年和闰日', () => {
  assert.equal(daysUntil('2026-09-26', new Date(2026, 8, 26, 23, 59)), 0);
  assert.equal(daysUntil('2026-09-25', new Date(2026, 8, 26, 0, 1)), -1);
  assert.equal(daysUntil('2027-01-01', new Date(2026, 11, 31, 23, 59)), 1);
  assert.equal(daysUntil('2028-03-01', new Date(2028, 1, 28, 12)), 2);
  assert.throws(() => daysUntil('2026-02-29'), /格式/);
});

test('审查复现（未修复）：两个页面写入旧快照时，后保存者会覆盖另一页的新记录', () => {
  const storage = memoryStorage();
  const pageA = readWorkbenchData(storage);
  const pageB = readWorkbenchData(storage);
  const itemA = createNote('页面 A 新记录', at);
  const itemB = createNote('页面 B 新记录', at);
  writeWorkbenchData(dataOf([...pageA.items, itemA]), storage);
  writeWorkbenchData(dataOf([...pageB.items, itemB]), storage);
  // 这是对当前缺陷的复现，不是认定这种覆盖行为正确；修复后应更新本测试的期望。
  assert.deepEqual(readWorkbenchData(storage).items.map(item => item.id), [itemB.id]);
});

test('审查：浏览器导入使用的有效/无效夹具与数据校验保持一致', () => {
  const valid = JSON.parse(readFileSync(new URL('./fixtures/review-valid.json', import.meta.url), 'utf8'));
  const invalid = JSON.parse(readFileSync(new URL('./fixtures/review-invalid.json', import.meta.url), 'utf8'));
  assert.throws(() => validateWorkbenchData(invalid), /格式/);
  const storage = memoryStorage();
  writeWorkbenchData(validateWorkbenchData(valid), storage);
  assert.deepEqual(readWorkbenchData(storage), valid);
  assert.equal(valid.items[0].updates.length, 2);
});

test('审查复现（未修复）：导入目前接受重复或空标签，选项归一化不改原记录', () => {
  const note = { ...createNote('标签边界', at), tags: ['学习', '学习', '', '#'] };
  assert.equal(validateWorkbenchData(dataOf([note])).items[0], note);
  assert.equal(availableUserTags([note]).filter(tag => tag === '学习').length, 1);
  assert.deepEqual(note.tags, ['学习', '学习', '', '#']);
});
