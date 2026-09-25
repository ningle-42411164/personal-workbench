import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, comparePriorityThenNewest, convertNote, createImportantDate, createNote, createRoutine, createSimpleItem, createTodo, daysUntil,
  emptyWorkbenchData, parseProjectTags, projectEditableFields, readWorkbenchData, removeItem, renameItem, toggleTodo, updateProject,
  validateWorkbenchData, writeWorkbenchData,
} from '../src/data/workbenchData.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('2.0 数据可以完整保存和恢复，旧键不被读取或删除', () => {
  const storage = memoryStorage();
  storage.setItem('personal-workbench.tasks.v1', '[{"title":"旧任务"}]');
  assert.deepEqual(readWorkbenchData(storage), emptyWorkbenchData());

  const todo = createTodo('新任务', true, '2026-09-24T10:00:00.000Z');
  const data = { schemaVersion: 2, items: [todo] };
  writeWorkbenchData(data, storage);
  assert.deepEqual(readWorkbenchData(storage), data);
  assert.equal(storage.getItem('personal-workbench.tasks.v1'), '[{"title":"旧任务"}]');
});

test('无效版本、格式、重复 ID 和失败写入都不覆盖原记录', () => {
  const storage = memoryStorage();
  const todo = createTodo('保留', false, '2026-09-24T10:00:00.000Z');
  const original = { schemaVersion: 2, items: [todo] };
  writeWorkbenchData(original, storage);
  const raw = storage.getItem(STORAGE_KEY);

  assert.throws(() => writeWorkbenchData({ schemaVersion: 3, items: [] }, storage), /版本/);
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: [{ ...todo, tags: '错' }] }, storage), /格式/);
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: [todo, { ...todo }] }, storage), /重复 ID/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);

  const failingStorage = { getItem: storage.getItem, setItem() { throw new Error('quota'); } };
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: [] }, failingStorage), /quota/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.deepEqual(validateWorkbenchData(JSON.parse(raw)), original);
});

test('完成时记录实际时间，恢复时清空完成时间', () => {
  const createdAt = '2026-09-24T10:00:00.000Z';
  const finishedAt = '2026-09-24T10:05:00.000Z';
  const restoredAt = '2026-09-24T10:06:00.000Z';
  const todo = createTodo('测试', false, createdAt);
  assert.equal(todo.createdAt, createdAt);
  assert.equal(todo.completedAt, null);
  const finished = toggleTodo(todo, finishedAt);
  assert.equal(finished.completedAt, finishedAt);
  assert.equal(finished.updatedAt, finishedAt);
  assert.equal(finished.createdAt, createdAt);
  const restored = toggleTodo(finished, restoredAt);
  assert.equal(restored.completedAt, null);
  assert.equal(restored.updatedAt, restoredAt);
  assert.equal(restored.createdAt, createdAt);
});

test('原始 2.0 数据损坏时读取报错且不改写', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{broken');
  assert.throws(() => readWorkbenchData(storage), /读取失败/);
  assert.equal(storage.getItem(STORAGE_KEY), '{broken');
});

test('四类事项共用一个 items，完整备份可读回且旧待办仍有效', () => {
  const storage = memoryStorage();
  const timestamp = '2026-09-24T10:00:00.000Z';
  const items = [
    createTodo('旧待办', true, timestamp),
    createNote('随笔', timestamp),
    createRoutine('持续提醒', timestamp),
    createImportantDate('重要日', '2026-10-01', timestamp),
  ];
  writeWorkbenchData({ schemaVersion: 2, items }, storage);
  assert.deepEqual(readWorkbenchData(storage).items, items);
  assert.deepEqual(items.map(item => item.type), ['todo', 'note', 'routine', 'importantDate']);
  assert.equal(items[0].urgent, true);
  assert.equal(items[1].createdAt, timestamp);
  assert.equal(items[3].targetDate, '2026-10-01');
});

test('日常提醒编辑更新修改时间，坏日期导入不覆盖原备份', () => {
  const storage = memoryStorage();
  const routine = createRoutine('旧标题', '2026-09-24T10:00:00.000Z');
  const edited = renameItem(routine, '新标题', '2026-09-24T10:10:00.000Z');
  assert.equal(edited.createdAt, routine.createdAt);
  assert.equal(edited.updatedAt, '2026-09-24T10:10:00.000Z');
  writeWorkbenchData({ schemaVersion: 2, items: [edited] }, storage);
  const raw = storage.getItem(STORAGE_KEY);
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: [createImportantDate('错误日期', '2026-02-30')] }, storage), /目标日期/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('日常持续新记录只保存名称和通用事项字段', () => {
  const storage = memoryStorage();
  const routine = createRoutine('背单词', '2026-09-24T10:00:00.000Z');
  writeWorkbenchData({ schemaVersion: 2, items: [routine] }, storage);
  assert.deepEqual(readWorkbenchData(storage).items[0], routine);
  assert.equal('remark' in routine, false);
});

test('重要日按本地日历日计数，跨月跨年和逾期不自动移除', () => {
  assert.equal(daysUntil('2027-01-01', new Date(2026, 11, 31, 23, 59)), 1);
  assert.equal(daysUntil('2026-12-31', new Date(2027, 0, 1, 0, 1)), -1);
  assert.equal(daysUntil('2026-09-24', new Date(2026, 8, 24, 18, 0)), 0);
  assert.equal(daysUntil('2026-03-09', new Date(2026, 2, 8, 23, 0)), 1);
  assert.equal(daysUntil('0099-01-01', new Date(2026, 8, 24)) < 0, true);
  assert.throws(() => daysUntil('2026-02-30'), /日期/);
});

test('第三步分类仍共用 2.0 备份，购物保留真实加入时间', () => {
  const storage = memoryStorage();
  const now = '2026-09-25T00:10:00.000Z';
  const items = ['project', 'shopping', 'waiting', 'creation'].map(type => createSimpleItem(type, type, now));
  writeWorkbenchData({ schemaVersion: 2, items }, storage);
  assert.deepEqual(readWorkbenchData(storage).items, items);
  assert.equal(items[1].createdAt, now);
  assert.throws(() => createSimpleItem('unknown', '不支持'), /不支持/);
});

test('随笔转换同时保留原文和生成目标，不能重复录入', () => {
  const note = createNote('想到的事', '2026-09-24T10:00:00.000Z');
  const now = '2026-09-25T00:10:00.000Z';
  const items = convertNote([note], note.id, 'todo', undefined, now);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, note.title);
  assert.equal(items[0].createdAt, note.createdAt);
  assert.equal(items[0].convertedToId, items[1].id);
  assert.equal(items[0].convertedAt, now);
  assert.equal(items[1].type, 'todo');
  assert.equal(items[1].createdAt, now);
  assert.throws(() => convertNote(items, note.id, 'shopping'), /不能重复/);
  assert.deepEqual(validateWorkbenchData({ schemaVersion: 2, items }).items, items);
});

test('重要日转换缺日期时不产生新事项；坏转换关系不能覆盖备份', () => {
  const storage = memoryStorage();
  const note = createNote('纪念', '2026-09-24T10:00:00.000Z');
  writeWorkbenchData({ schemaVersion: 2, items: [note] }, storage);
  const raw = storage.getItem(STORAGE_KEY);
  assert.throws(() => convertNote([note], note.id, 'importantDate', ''), /目标日期/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  const converted = convertNote([note], note.id, 'importantDate', '2026-12-01');
  assert.equal(converted[1].targetDate, '2026-12-01');
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: [converted[0]] }, storage), /目标不存在/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  writeWorkbenchData({ schemaVersion: 2, items: converted }, storage);
  assert.deepEqual(readWorkbenchData(storage).items, converted);
});

test('各类型按 ID 删除时只移除指定事项，其他记录保留', () => {
  const now = '2026-09-25T00:20:00.000Z';
  const items = [
    createNote('随笔', now), createTodo('待办', false, now), createRoutine('提醒', now),
    createImportantDate('重要日', '2026-10-01', now),
    ...['project', 'waiting', 'creation', 'shopping'].map(type => createSimpleItem(type, type, now)),
  ];
  for (const item of items) {
    const next = removeItem(items, item.id);
    assert.deepEqual(next, items.filter(candidate => candidate.id !== item.id));
    validateWorkbenchData({ schemaVersion: 2, items: next });
  }
  assert.throws(() => removeItem(items, 'missing'), /不存在/);
});

test('删除转换目标只恢复原随笔，删除原随笔不误删目标', () => {
  const createdAt = '2026-09-24T10:00:00.000Z';
  const removedAt = '2026-09-25T00:30:00.000Z';
  const note = createNote('保留原文', createdAt);
  const converted = convertNote([note], note.id, 'shopping', undefined, '2026-09-25T00:20:00.000Z');
  const restored = removeItem(converted, converted[1].id, removedAt);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, note.title);
  assert.equal(restored[0].createdAt, createdAt);
  assert.equal(restored[0].updatedAt, removedAt);
  assert.equal(restored[0].convertedToId, undefined);
  validateWorkbenchData({ schemaVersion: 2, items: restored });
  assert.deepEqual(removeItem(converted, note.id), [converted[1]]);
});

test('删除结果写入失败时，原始备份不变', () => {
  const storage = memoryStorage();
  const items = [createTodo('保留的任务', false)];
  writeWorkbenchData({ schemaVersion: 2, items }, storage);
  const raw = storage.getItem(STORAGE_KEY);
  const failingStorage = { setItem() { throw new Error('quota'); } };
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: removeItem(items, items[0].id) }, failingStorage), /quota/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('优先处理标记随分类保存，排序在普通事项之前', () => {
  const storage = memoryStorage();
  const normal = createSimpleItem('project', '普通项目', '2026-09-25T11:00:00.000Z');
  const priority = createSimpleItem('project', '优先项目', '2026-09-25T10:00:00.000Z', true);
  const date = createImportantDate('优先日期', '2026-10-01', '2026-09-25T09:00:00.000Z', true);
  const data = { schemaVersion: 2, items: [normal, priority, date] };
  writeWorkbenchData(data, storage);
  assert.deepEqual(readWorkbenchData(storage), data);
  assert.equal(normal.priority, false);
  assert.equal(priority.priority, true);
  assert.equal(date.priority, true);
  assert.deepEqual([normal, priority].sort(comparePriorityThenNewest).map(item => item.title), ['优先项目', '普通项目']);
  const raw = storage.getItem(STORAGE_KEY);
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: [{ ...normal, priority: 'yes' }] }, storage), /优先处理/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('旧项目仍可读取；新项目只在当前情况变化时追加真实时间的历史', () => {
  const storage = memoryStorage();
  const createdAt = '2026-09-25T10:00:00.000Z';
  const oldProject = { ...createSimpleItem('project', '旧项目', createdAt) };
  delete oldProject.status;
  delete oldProject.startDate;
  delete oldProject.dueDate;
  delete oldProject.currentSituation;
  delete oldProject.nextStep;
  delete oldProject.updates;
  delete oldProject.completedAt;
  writeWorkbenchData({ schemaVersion: 2, items: [oldProject] }, storage);
  assert.deepEqual(readWorkbenchData(storage).items[0], oldProject);
  const base = projectEditableFields(oldProject);
  assert.equal(base.status, 'active');
  assert.deepEqual(parseProjectTags('#代码，#学习 代码'), ['代码', '学习']);
  assert.equal(updateProject(oldProject, base, '2026-09-25T10:01:00.000Z'), oldProject);

  const firstAt = '2026-09-25T10:02:00.000Z';
  const first = updateProject(oldProject, { ...base, tags: ['代码'], startDate: '2026-09-25', currentSituation: '第一版' }, firstAt);
  const secondAt = '2026-09-25T10:03:00.000Z';
  const second = updateProject(first, { ...projectEditableFields(first), currentSituation: '第二版', nextStep: '验证' }, secondAt);
  assert.deepEqual(second.updates.map(record => [record.content, record.createdAt]), [['第一版', firstAt], ['第二版', secondAt]]);
  assert.equal(second.createdAt, createdAt);
  assert.equal(updateProject(second, projectEditableFields(second), '2026-09-25T10:04:00.000Z'), second);
  writeWorkbenchData({ schemaVersion: 2, items: [second] }, storage);
  assert.deepEqual(JSON.parse(JSON.stringify(readWorkbenchData(storage))).items[0].updates, second.updates);
});

test('项目完成和恢复记录时间，坏历史不能覆盖已有备份', () => {
  const storage = memoryStorage();
  const project = createSimpleItem('project', '测试项目', '2026-09-25T10:00:00.000Z');
  const finishedAt = '2026-09-25T10:05:00.000Z';
  const finished = updateProject(project, { ...projectEditableFields(project), status: 'done' }, finishedAt);
  assert.equal(finished.completedAt, finishedAt);
  assert.equal(finished.updates.length, 0);
  writeWorkbenchData({ schemaVersion: 2, items: [finished] }, storage);
  const raw = storage.getItem(STORAGE_KEY);
  assert.throws(() => writeWorkbenchData({ schemaVersion: 2, items: [{ ...finished, updates: [{ id: 'x', content: '进展', createdAt: 'bad' }] }] }, storage), /项目详情/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  const reopened = updateProject(finished, { ...projectEditableFields(finished), status: 'active' }, '2026-09-25T10:06:00.000Z');
  assert.equal(reopened.completedAt, null);
});
