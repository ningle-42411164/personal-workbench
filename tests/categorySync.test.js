import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createSyncStore } from '../src/sync/syncStore.js';
import { createSyncEngine } from '../src/sync/syncEngine.js';
import { createSyncApi } from '../src/sync/syncApi.js';
import { createNote, createSimpleItem, createRoutine, createImportantDate, convertNote, renameItem, toggleTodo, removeItem, validateWorkbenchData } from '../src/data/workbenchData.js';
import { prepareOwnerPhoneSync } from '../src/sync/ownerPhone.js';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from '../services/workbench-api/src/service.js';
import { D1Store } from '../services/workbench-api/src/store.js';
import { sqliteD1 } from '../services/workbench-api/test/sqlite-d1.js';
import { handleApi } from '../services/workbench-api/src/http.js';
import { fixtureMcpClient } from '../services/workbench-api/test/mcp-fixture.js';

export const at = '2026-10-26T12:00:00.000Z';
export const data = items => ({ schemaVersion: 2, items });
export function fixture(t, items = []) {
  const indexedDB = new IDBFactory(), raw = JSON.stringify(data(items));
  const store = createSyncStore({ indexedDB, storage: { getItem: () => raw }, ownerPhone: true });
  const db = sqliteD1(), service = new WorkbenchService(new D1Store(db, 'category-fixture'), { id: 'category-fixture', scopes: [READ_SCOPE, WRITE_SCOPE] });
  const controls = { loseReply: false, fail: false, writes: [], statuses: [], pageLimit: null, stopAt: null };
  const api = createSyncApi({ issuer: 'https://categories.test', auth: { getAccessToken: async () => 'fixture-access', getStatus: () => ({ canWrite: true }) },
    async fetcher(url, options) {
      if (options.method !== 'GET') controls.writes.push(options.body);
      if (controls.fail) throw new TypeError('fixture network failure');
      if (url.pathname === '/api/changes' && controls.pageLimit) url.searchParams.set('limit', controls.pageLimit);
      if (url.pathname === '/api/changes' && url.searchParams.get('since') === controls.stopAt) throw new TypeError('fixture interrupted pagination');
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

for (const type of ['routine', 'importantDate']) test(`${type}: 纳入、编辑、拉取和删除，不接受完成状态`, async t => {
  const item = type === 'routine' ? createRoutine('持续事项', at) : createImportantDate('重要日', '2027-01-01', at);
  const s = fixture(t, [item]); await s.engine.run();
  let record = await s.service.getItem({ id: item.id }); assert.deepEqual(record.item, item);
  await assert.rejects(s.service.completeItem({ id: item.id, requestId: 'no-completion-allowed', expectedVersion: record.version, done: true }), error => error.code === 'INVALID_INPUT');
  await save(s, items => items.map(value => renameItem(value, '本机修改'))); await s.engine.run();
  record = await s.service.getItem({ id: item.id });
  await s.service.patchItem({ id: item.id, requestId: 'routine-date-remote', expectedVersion: record.version, fields: { title: '云端修改', ...(type === 'importantDate' ? { targetDate: '2027-02-01' } : {}) } });
  await s.engine.run(); const local = (await s.store.read()).data.items[0]; assert.equal(local.title, '云端修改');
  if (type === 'importantDate') assert.equal(local.targetDate, '2027-02-01');
  await save(s, items => removeItem(items, item.id)); await s.engine.run(); assert.equal((await s.service.syncState({ id: item.id })).deleted, true);
});

test('转换原子上传、丢回执重试不重复；删除目标同时解除原文关联', async t => {
  const note = createNote('转换保留原文', at), s = fixture(t, [note]); await s.engine.run();
  await save(s, items => convertNote(items, note.id, 'importantDate', '2027-01-01'));
  const target = (await s.store.read()).data.items.find(item => item.type === 'importantDate');
  s.controls.loseReply = true; await s.engine.run();
  const job = (await s.store.read()).outbox[note.id]; assert.equal(job.entries.length, 2);
  assert.equal((await s.service.getItem({ id: note.id })).item.convertedToId, target.id);
  await s.engine.run(); assert.equal(s.controls.writes.at(-1), s.controls.writes.at(-2));
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 2);
  await save(s, items => removeItem(items, target.id)); await s.engine.run();
  assert.equal((await s.service.getItem({ id: note.id })).item.convertedToId, undefined);
  assert.equal((await s.service.syncState({ id: target.id })).deleted, true);
  assert.deepEqual(Object.keys((await s.store.read()).dirty), []);
});

test('跨页转换暂存到完整高水位；中断重开继续，不产生残缺关联或重复记录', async t => {
  const s = fixture(t);
  const note = await s.service.create({ requestId: 'paged-note-create', type: 'note', title: '跨页原文' });
  await s.service.convertNote({ id: note.item.id, requestId: 'paged-note-convert', expectedVersion: 1, targetType: 'project' });
  s.controls.pageLimit = '1'; s.controls.stopAt = '2'; await s.engine.run();
  let state = await s.store.read(); assert.equal(state.cursor, '2'); assert.equal(state.data.items.length, 0); assert.ok(state.pull);
  s.controls.stopAt = null; await s.engine.run(); state = await s.store.read();
  assert.equal(state.data.items.length, 2); assert.equal(state.pull, undefined); validateWorkbenchData(state.data);
  await s.engine.run(); assert.equal((await s.store.read()).data.items.length, 2);
});

test('转换版本冲突整组不写，双方保留；采用云端时保留关联的本机副本', async t => {
  const note = createNote('冲突原文', at), s = fixture(t, [note]); await s.engine.run();
  await save(s, items => convertNote(items, note.id, 'todo'));
  await s.service.patchItem({ id: note.id, requestId: 'competing-note-edit', expectedVersion: 1, fields: { title: '云端原文更新' } });
  await s.engine.run(); let state = await s.store.read();
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
  assert.equal(state.blocked[note.id].group.length, 2); assert.equal(state.data.items.length, 2);
  await s.store.resolveWithCopy(note.id, state.revision); state = await s.store.activateOwnerPhone(true);
  validateWorkbenchData(state.data); assert.equal(Object.keys(state.heldLocal).length, 2);
  await s.engine.run(); assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
});

test('D1 批次并发准入失败和 SQL 中途失败均零部分写入', async t => {
  const note = createNote('事务原文', at), s = fixture(t, [note]); await s.engine.run();
  const originalBatch = s.db.batch.bind(s.db);
  s.db.batch = statements => originalBatch([...statements, s.db.prepare('INSERT INTO nonexistent_fixture_table VALUES (1)')]);
  await assert.rejects(s.service.convertNote({ id: note.id, requestId: 'atomic-failure-convert', expectedVersion: 1, targetType: 'todo' }));
  assert.equal((await s.service.getItem({ id: note.id })).item.convertedToId, undefined);
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
  s.db.batch = async statements => { s.db.batch = originalBatch; s.db.prepare('UPDATE workbench_items SET version = version + 1 WHERE item_id = ?').bind(note.id).run(); return originalBatch(statements); };
  await assert.rejects(s.service.convertNote({ id: note.id, requestId: 'atomic-race-convert', expectedVersion: 1, targetType: 'todo' }), error => error.code === 'VERSION_CONFLICT');
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
  assert.equal((await s.service.getItem({ id: note.id })).item.convertedToId, undefined);
});

test('未授权手机访客启动与本机保存不请求令牌、不联网、不产生待同步队列', async t => {
  const note = createNote('访客本机随笔', at), s = fixture(t, [note]);
  const auth = { getStatus: () => ({ state: 'disconnected', remembered: false, canWrite: false }), getAccessToken: () => { throw new Error('访客不应请求授权'); } };
  const engine = createSyncEngine({ store: s.store, api: s.api, beforeRun: () => prepareOwnerPhoneSync(s.store, auth), schedule: () => 1, cancel: () => {} }); t.after(() => engine.stop());
  await engine.run(); await save(s, items => items.map(value => renameItem(value, '访客正常编辑'))); await engine.run();
  const state = await s.store.read(); assert.equal(state.data.items[0].title, '访客正常编辑'); assert.equal(state.enabled, false); assert.equal(state.nodeOne, undefined); assert.deepEqual(state.dirty, {}); assert.equal(s.controls.writes.length, 0);
});

test('真实 MCP SDK 修改/完成/恢复/转换/删除后，原同步引擎自动拉回同一首页数据', async t => {
  const s = fixture(t, [createNote('MCP往返原文', at)]); await s.engine.run();
  const client = await fixtureMcpClient(s.service); t.after(() => client.close());
  const call = async (name, args) => { const result = await client.callTool({ name, arguments: args }); assert.notEqual(result.isError, true, JSON.stringify(result)); return result.structuredContent; };
  const note = (await call('list_items', { type: 'note' })).items[0];
  await call('update_item', { id: note.item.id, expectedVersion: note.version, requestId: 'sdk-sync-edit', fields: { title: '聊天修改后' } });
  await s.engine.run(); assert.equal((await s.store.read()).data.items[0].title, '聊天修改后');
  const converted = await call('convert_note', { id: note.item.id, expectedVersion: 2, requestId: 'sdk-sync-convert', targetType: 'todo' });
  await s.engine.run(); let state = await s.store.read(); assert.equal(state.data.items.length, 2); validateWorkbenchData(state.data);
  let todo = converted.records.find(record => record.item.type === 'todo');
  todo = await call('set_item_completion', { id: todo.item.id, expectedVersion: todo.version, requestId: 'sdk-sync-complete', done: true });
  await s.engine.run(); assert.equal((await s.store.read()).data.items.find(item => item.id === todo.item.id).done, true);
  todo = await call('set_item_completion', { id: todo.item.id, expectedVersion: todo.version, requestId: 'sdk-sync-restore', done: false });
  await s.engine.run(); assert.equal((await s.store.read()).data.items.find(item => item.id === todo.item.id).done, false);
  await call('delete_item', { id: todo.item.id, expectedVersion: todo.version, requestId: 'sdk-sync-delete' });
  await s.engine.run(); state = await s.store.read(); assert.equal(state.data.items.length, 1); assert.equal(state.data.items[0].convertedToId, undefined);
});

test('本机修改期间云端转换：冲突包含完整目标，保留副本后可恢复同步', async t => {
  const note = createNote('并发随笔', at), s = fixture(t, [note]); await s.engine.run();
  await save(s, items => items.map(item => renameItem(item, '本机继续编辑')));
  await s.service.convertNote({ id: note.id, expectedVersion: 1, requestId: 'remote-convert-race', targetType: 'project' });
  await s.engine.run(); let state = await s.store.read(); assert.equal(state.blocked[note.id].group.length, 2);
  await s.store.resolveWithCopy(note.id, state.revision); await s.engine.run(); state = await s.store.read();
  validateWorkbenchData(state.data); assert.equal(state.data.items.length, 3); assert.equal(Object.keys(state.blocked).length, 0);
});

test('升级前已转换随笔自动纳入，复用节点一已上传的相同目标而不重复创建', async t => {
  const note = createNote('旧转换原文', at), items = convertNote([note], note.id, 'project');
  const s = fixture(t, items), target = items.find(item => item.type === 'project');
  await s.service.sync({ id: target.id, requestId: 'previous-node-target', expectedVersion: 0, item: target });
  await s.engine.run(); const state = await s.store.read();
  assert.equal(state.bindings[target.id].version, 1); assert.equal(state.bindings[note.id].version, 1);
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 2); assert.deepEqual(state.blocked, {});
});

test('旧请求结果不明时再转换：先重放旧请求再原子转换，发送后编辑仍保留', async t => {
  const note = createNote('进行中转换', at), s = fixture(t, [note]); await s.engine.run();
  await save(s, items => items.map(item => renameItem(item, '转换前改名')));
  const previous = await s.store.prepare(); await s.api.send(previous);
  await save(s, items => convertNote(items, note.id, 'shopping'));
  await s.engine.run();
  let state = await s.store.read(); const target = state.data.items.find(item => item.type === 'shopping');
  assert.equal((await s.service.getItem({ id: note.id })).version, 3); assert.equal((await s.service.list({ includeCompleted: true })).items.length, 2);
  await save(s, items => items.map(item => item.id === target.id ? renameItem(item, '第一次编辑') : item));
  const group = await s.store.prepare(); await s.api.send(group);
  await save(s, items => items.map(item => item.id === target.id ? renameItem(item, '发送期间继续编辑') : item));
  await s.engine.run(); state = await s.store.read();
  assert.equal(state.data.items.find(item => item.id === target.id).title, '发送期间继续编辑');
  assert.equal((await s.service.getItem({ id: target.id })).item.title, '发送期间继续编辑'); assert.deepEqual(state.dirty, {});
});

test('32 条旧关联组在免费 D1 查询/参数限制内原子创建及删除', async t => {
  const target = createSimpleItem('shopping', '共同目标', at);
  const items = [target, ...Array.from({ length: 31 }, (_, i) => ({ ...createNote('关联原文' + i, at), convertedToId: target.id, convertedToType: target.type, convertedAt: at }))];
  const s = fixture(t), originalPrepare = s.db.prepare.bind(s.db), originalBatch = s.db.batch.bind(s.db);
  let queries = 0, maxParameters = 0;
  s.db.prepare = query => {
    const original = originalPrepare(query);
    return { ...original, bind(...args) {
      maxParameters = Math.max(maxParameters, args.length); assert.ok(args.length <= 100);
      const bound = original.bind(...args);
      return { ...bound, first: (...values) => { queries++; return bound.first(...values); }, all: (...values) => { queries++; return bound.all(...values); } };
    } };
  };
  s.db.batch = statements => { queries++; return originalBatch(statements); };
  await s.service.syncBatch({ requestId: 'large-group-create', entries: items.map(item => ({ id: item.id, expectedVersion: 0, item })) });
  assert.ok(queries < 50); assert.ok(maxParameters <= 100); queries = 0;
  await s.service.syncBatch({ requestId: 'large-group-delete', entries: items.map(item => ({ id: item.id, expectedVersion: 1, item: null })) });
  assert.ok(queries < 50); assert.equal((await s.service.list({ includeCompleted: true })).items.length, 0);
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
