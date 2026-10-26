import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createSyncStore } from '../src/sync/syncStore.js';
import { createSyncEngine } from '../src/sync/syncEngine.js';
import { createSyncApi } from '../src/sync/syncApi.js';
import { createNote, createSimpleItem, renameItem, toggleTodo, removeItem } from '../src/data/workbenchData.js';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from '../services/workbench-api/src/service.js';
import { D1Store } from '../services/workbench-api/src/store.js';
import { sqliteD1 } from '../services/workbench-api/test/sqlite-d1.js';
import { handleApi } from '../services/workbench-api/src/http.js';

export const at = '2026-10-26T12:00:00.000Z';
export const data = items => ({ schemaVersion: 2, items });
export function fixture(t, items = []) {
  const indexedDB = new IDBFactory(), raw = JSON.stringify(data(items));
  const store = createSyncStore({ indexedDB, storage: { getItem: () => raw }, ownerPhone: true });
  const db = sqliteD1(), service = new WorkbenchService(new D1Store(db, 'category-fixture'), { id: 'category-fixture', scopes: [READ_SCOPE, WRITE_SCOPE] });
  const controls = { loseReply: false, fail: false, writes: [], statuses: [] };
  const api = createSyncApi({ issuer: 'https://categories.test', auth: { getAccessToken: async () => 'fixture-access', getStatus: () => ({ canWrite: true }) },
    async fetcher(url, options) {
      if (options.method !== 'GET') controls.writes.push(options.body);
      if (controls.fail) throw new TypeError('fixture network failure');
      const response = await handleApi(new Request(url, options), service, 'https://categories.test');
      if (controls.loseReply && options.method !== 'GET') { controls.loseReply = false; throw new TypeError('fixture response lost'); }
      return response;
    } });
  const engine = createSyncEngine({ store, api, beforeRun: () => store.activateOwnerPhone(true), onStatus: value => controls.statuses.push(value), schedule: () => 1, cancel: () => {} });
  t.after(async () => { engine.stop(); await store.close(); db.close(); });
  return { store, db, service, api, engine, controls, indexedDB };
}
export async function save(s, change) { const state = await s.store.read(); return s.store.save(data(change(state.data.items)), state.revision); }

for (const type of ['note', 'waiting', 'shopping', 'creation']) test(`${type}: 自动纳入、编辑、完成恢复、原请求重试、云端拉取及删除墓碑`, async t => {
  const item = type === 'note' ? createNote('分类夹具', at) : createSimpleItem(type, '分类夹具', at);
  const s = fixture(t, [item]); s.controls.loseReply = true;
  await s.engine.run(); assert.equal(s.controls.statuses.at(-1).phase, 'failed');
  await s.engine.run(); assert.equal(s.controls.writes[0], s.controls.writes[1]);
  let remote = await s.service.getItem({ id: item.id }); assert.equal(remote.version, 1);
  await save(s, items => items.map(value => toggleTodo(renameItem(value, '已改名')))); await s.engine.run();
  remote = await s.service.getItem({ id: item.id }); assert.equal(remote.item.done, true); assert.equal(remote.item.title, '已改名');
  await save(s, items => items.map(value => toggleTodo(value))); await s.engine.run();
  remote = await s.service.getItem({ id: item.id }); assert.equal(remote.item.done, false); assert.equal(remote.item.completedAt, null);
  await s.service.patchItem({ id: item.id, expectedVersion: remote.version, requestId: 'category-remote-edit', fields: { title: '云端修改' } });
  await s.engine.run(); assert.equal((await s.store.read()).data.items[0].title, '云端修改');
  await save(s, items => removeItem(items, item.id)); await s.engine.run();
  const tombstone = await s.service.syncState({ id: item.id }); assert.equal(tombstone.deleted, true);
  await assert.rejects(s.service.sync({ id: item.id, requestId: 'category-no-resurrection', expectedVersion: 0, item }), error => error.code === 'ITEM_DELETED');
  assert.equal((await s.service.list({ type, includeCompleted: true })).items.length, 0);
});

test('范围升级重扫旧游标：补拉旧分类、重放不重复、旧删除不复活，暂停不被开启', async t => {
  const s = fixture(t), live = createNote('旧云端随笔', at), gone = createSimpleItem('shopping', '已删购物', at);
  await s.service.create({ id: live.id, type: live.type, title: live.title, requestId: 'old-cloud-note' });
  const r = await s.service.create({ id: gone.id, type: gone.type, title: gone.title, requestId: 'old-cloud-shopping' });
  await s.service.deleteItem({ id: gone.id, expectedVersion: r.version, requestId: 'old-cloud-delete' });
  await s.store.read();
  const db = await new Promise(resolve => { const r = s.indexedDB.open('personal-workbench.local-sync.v1'); r.onsuccess = () => resolve(r.result); });
  await new Promise(resolve => { const tx = db.transaction('state', 'readwrite'), bucket = tx.objectStore('state'); bucket.get('workbench').onsuccess = event => { const old = event.target.result; old.cursor = '3'; old.syncScopeVersion = 1; bucket.put(old, 'workbench'); }; tx.oncomplete = resolve; }); db.close();
  const migrated = await s.store.read(); assert.equal(migrated.cursor, '0'); assert.equal(migrated.enabled, false);
  await s.engine.run(); await s.engine.run();
  const state = await s.store.read(); assert.deepEqual(state.data.items.map(item => item.id), [live.id]); assert.equal(state.bindings[gone.id].deleted, true);
  assert.equal(s.controls.writes.length, 0); assert.equal(state.cursor, '3');
});

test('旧完成字段缺省可保留，错误的状态组合不能上传，冲突保留双方', async t => {
  const item = createNote('旧随笔', at); delete item.done; delete item.completedAt;
  const s = fixture(t, [item]); await s.engine.run();
  assert.deepEqual((await s.service.getItem({ id: item.id })).item, item);
  await assert.rejects(s.service.sync({ id: item.id, requestId: 'category-invalid-done', expectedVersion: 1, item: { ...item, done: true, completedAt: null } }));
  await save(s, items => items.map(value => renameItem(value, '本机待同步')));
  await s.service.patchItem({ id: item.id, requestId: 'category-conflicting-edit', expectedVersion: 1, fields: { title: '服务端另改' } });
  await s.engine.run(); const state = await s.store.read();
  assert.equal(state.data.items[0].title, '本机待同步'); assert.equal(state.blocked[item.id].remote.item.title, '服务端另改');
});
