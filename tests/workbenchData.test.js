import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, createTodo, emptyWorkbenchData, readWorkbenchData,
  toggleTodo, validateWorkbenchData, writeWorkbenchData,
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
