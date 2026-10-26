import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createSyncStore } from '../src/sync/syncStore.js';
import { createSyncApi } from '../src/sync/syncApi.js';
import { createSyncEngine } from '../src/sync/syncEngine.js';
import { isOwnerPhoneTarget, prepareOwnerPhoneSync } from '../src/sync/ownerPhone.js';
import { KNOWN_TEST_IDS } from '../src/sync/knownTestRecords.js';
import { createTodo, createProject, createNote, renameItem, updateProject, STORAGE_KEY } from '../src/data/workbenchData.js';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from '../services/workbench-api/src/service.js';
import { D1Store } from '../services/workbench-api/src/store.js';
import { handleApi } from '../services/workbench-api/src/http.js';
import { sqliteD1 } from '../services/workbench-api/test/sqlite-d1.js';

const production = { origin: 'https://ningle-42411164.github.io', pathname: '/personal-workbench/' };
const huawei = { userAgent: 'Mozilla/5.0 (Linux; Android 12; HUAWEI) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 EdgA/130', maxTouchPoints: 5 };
const at = '2026-10-26T10:00:00.000Z';
const data = items => ({ schemaVersion: 2, items });
function fixture(t, items = [], { ownerPhone = true } = {}) {
  const indexedDB = new IDBFactory(); let raw = JSON.stringify(data(items));
  const storage = { getItem: () => raw, setItem: (_key, next) => { raw = next; } };
  const store = createSyncStore({ indexedDB, storage, ownerPhone });
  const db = sqliteD1();
  const service = new WorkbenchService(new D1Store(db, 'fictional-node-owner'), { id: 'fictional-node-owner', scopes: [READ_SCOPE, WRITE_SCOPE] });
  const calls = [];
  const auth = { getAccessToken: async () => 'fake-node-one-access', getStatus: () => ({ state: 'connected', remembered: true, canWrite: true }) };
  const api = createSyncApi({ auth, issuer: 'https://node-one.test', fetcher: (url, options) => {
    calls.push({ path: url.pathname, method: options.method, body: options.body });
    return handleApi(new Request(url, options), service, 'https://node-one.test');
  } });
  const statuses = [];
  const engine = createSyncEngine({ store, api, beforeRun: () => prepareOwnerPhoneSync(store, auth), onStatus: status => statuses.push(status), schedule: () => 1, cancel: () => {} });
  t.after(async () => { engine.stop(); await store.close(); db.close(); });
  return { store, indexedDB, storage, db, service, engine, api, calls, statuses };
}

test('来源门控：正式地址的华为手机/手机 PWA 可纳入，电脑、小窗口、触屏电脑及隔离地址不可纳入', () => {
  assert.equal(isOwnerPhoneTarget(production, huawei), true);
  assert.equal(isOwnerPhoneTarget(production, { ...huawei, standalone: true }), true);
  assert.equal(isOwnerPhoneTarget(production, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile', maxTouchPoints: 5 }), true);
  const desktop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Edg/130', maxTouchPoints: 10, userAgentData: { mobile: false, platform: 'Windows' } };
  assert.equal(isOwnerPhoneTarget(production, desktop), false);
  assert.equal(isOwnerPhoneTarget(production, { ...desktop, userAgentData: { mobile: true } }), false);
  assert.equal(isOwnerPhoneTarget({ origin: 'http://127.0.0.1:4316', pathname: '/personal-workbench/' }, huawei), false);
  assert.equal(isOwnerPhoneTarget({ ...production, pathname: '/another-project/' }, huawei), false);
  assert.equal(isOwnerPhoneTarget(production, { ...huawei, maxTouchPoints: 0 }), false);
  assert.equal(isOwnerPhoneTarget(production, { userAgent: 'Linux Android 12', maxTouchPoints: 5 }), false);
});

test('首次连接恢复失败不丢本机；已有读写连接后台恢复后无需重新授权或手动上传即可自动纳入', async t => {
  const todo = createTodo('首次恢复重试夹具', false, at), s = fixture(t, [todo]);
  let reachable = false, restores = 0, status = { state: 'offline', remembered: true, canWrite: false };
  const auth = { getStatus: () => status, async getAccessToken() { restores++; if (!reachable) throw new TypeError('fictional restore failure'); status = { state: 'connected', remembered: true, canWrite: true }; return 'fake-existing-access'; } };
  const statuses = [];
  const engine = createSyncEngine({ store: s.store, api: s.api, beforeRun: () => prepareOwnerPhoneSync(s.store, auth), onStatus: value => statuses.push(value), schedule: () => 1, cancel: () => {} });
  t.after(() => engine.stop()); await engine.run();
  let state = await s.store.read(); assert.equal(state.nodeOne, undefined); assert.deepEqual(state.data.items, [todo]);
  assert.equal(statuses.at(-1).phase, 'failed'); assert.equal(s.calls.length, 0);
  reachable = true; await engine.run(); state = await s.store.read();
  assert.equal(restores, 2); assert.equal(state.bindings[todo.id].version, 1); assert.equal(statuses.at(-1).phase, 'ready');
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
});

test('手机首次更新：有效读写权限才自动纳入待办/项目；已知测试 ID 排除，同名正式事项仍保留', async t => {
  const todo = createTodo('古古怪怪', true, at), project = createProject('正式项目夹具', { currentSituation: '已有内容' }, at), note = createNote('随笔仍只在本机', at);
  const fake = { ...createTodo('古古怪怪', false, at), id: KNOWN_TEST_IDS[1] };
  const s = fixture(t, [todo, project, note, fake]); const oldRaw = s.storage.getItem(STORAGE_KEY);
  let state = await s.store.activateOwnerPhone(false);
  assert.equal(state.enabled, false); assert.equal(state.nodeOne, undefined); assert.deepEqual(state.bindings, {});
  await s.engine.run(); state = await s.store.read();
  assert.equal(state.enabled, true); assert.equal(state.nodeOne.source, 'owner-phone');
  assert.deepEqual(state.nodeOne.enrolledIds, [todo.id, project.id]);
  assert.equal(state.bindings[note.id], undefined); assert.equal(state.bindings[fake.id], undefined);
  const cloud = await s.service.list({ includeCompleted: true }); assert.equal(cloud.items.length, 2);
  assert.equal(cloud.items.find(r => r.item.id === todo.id).item.title, '古古怪怪');
  assert.equal((await s.service.getItem({ id: todo.id })).item.createdAt, at);
  assert.equal(state.data.items.length, 4); assert.equal(s.storage.getItem(STORAGE_KEY), oldRaw);
  assert.ok(s.calls.every(call => !call.body || !call.body.includes(fake.id)));
});

test('重复更新、并发纳入、重开页面复用原绑定/设备标记及未确认请求，不产生重复创建或历史', async t => {
  const project = createProject('重复纳入项目夹具', { currentSituation: '原历史' }, at);
  const s = fixture(t, [project]);
  const [a, b] = await Promise.all([s.store.activateOwnerPhone(true), s.store.activateOwnerPhone(true)]);
  assert.equal(a.nodeOne.deviceId, b.nodeOne.deviceId);
  const job = await s.store.prepare();
  const reopened = createSyncStore({ indexedDB: s.indexedDB, storage: s.storage, ownerPhone: true }); t.after(() => reopened.close());
  const next = await reopened.activateOwnerPhone(true);
  assert.equal(next.nodeOne.deviceId, a.nodeOne.deviceId); assert.equal(next.outbox[project.id].requestId, job.requestId);
  await s.engine.run(); await s.engine.run();
  const record = await s.service.getProject({ id: project.id }); assert.equal(record.version, 1); assert.deepEqual(record.item.updates, project.updates);
  assert.equal(s.calls.filter(call => call.method === 'PUT').length, 1);
  assert.deepEqual((await s.store.read()).nodeOne.enrolledIds, [project.id]);
});

test('电脑和隔离存储不自动纳入现有或新建数据；只开启读取也不把未绑定记录作为上传来源', async t => {
  const local = createTodo('电脑数据夹具', false, at), s = fixture(t, [local], { ownerPhone: false });
  let state = await s.store.activateOwnerPhone(true); assert.equal(state.nodeOne, undefined); assert.equal(state.enabled, false);
  await s.store.setEnabled(true);
  const newItem = createProject('电脑新建夹具', {}, at); state = await s.store.read(); await s.store.save(data([...state.data.items, newItem]), state.revision);
  await s.engine.run(); assert.deepEqual((await s.store.read()).bindings, {});
  assert.equal(s.calls.filter(call => call.method !== 'GET').length, 0);
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 0);
});

test('同 ID 同内容的云端记录只接续绑定，不同内容保留双方；冲突副本不被重复自动纳入', async t => {
  const same = createTodo('已存在相同内容', false, at), local = createProject('有版本分歧的项目', { currentSituation: '手机本机内容' }, at);
  const s = fixture(t, [same, local]);
  await s.service.sync({ id: same.id, requestId: 'node-existing-same', expectedVersion: 0, item: same });
  const remote = updateProject(local, { currentSituation: '另一份云端内容' }, '2026-10-26T10:01:00.000Z');
  await s.service.sync({ id: remote.id, requestId: 'node-existing-different', expectedVersion: 0, item: remote });
  await s.engine.run(); let state = await s.store.read();
  assert.equal(state.bindings[same.id].version, 1); assert.equal(state.blocked[same.id], undefined);
  assert.equal(state.data.items.find(item => item.id === local.id).currentSituation, '手机本机内容');
  assert.equal(state.blocked[local.id].remote.item.currentSituation, '另一份云端内容');
  assert.equal((await s.service.getProject({ id: local.id })).item.currentSituation, '另一份云端内容');
  await s.store.resolveWithCopy(local.id, state.revision); state = await s.store.activateOwnerPhone(true);
  const held = state.data.items.find(item => state.heldLocal?.[item.id]); assert.equal(held.currentSituation, '手机本机内容');
  assert.equal(state.bindings[held.id], undefined); await s.engine.run();
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 2);
});

test('默认正式列表和增量只按已知 ID 隔离测试，旧记录原文仍可按显式 ID 读取，分页游标不漏正式变化', async t => {
  const s = fixture(t);
  for (const [index, id] of KNOWN_TEST_IDS.entries()) await s.service.sync({ id, requestId: `node-known-test-${index}`, expectedVersion: 0, item: { ...createTodo('同名夹具', false, at), id } });
  const initial = await s.service.changes({}); assert.equal(initial.changes.length, 0); assert.equal(initial.cursor, '4');
  const real = createTodo('同名夹具', false, at); await s.service.sync({ id: real.id, requestId: 'node-personal-same-name', expectedVersion: 0, item: real });
  assert.deepEqual((await s.service.list({ includeCompleted: true })).items.map(record => record.item.id), [real.id]);
  const feed = await s.service.changes({ since: initial.cursor }); assert.deepEqual(feed.changes.map(change => change.id), [real.id]);
  assert.equal((await s.service.getItem({ id: KNOWN_TEST_IDS[0] })).item.title, '同名夹具');
  const all = await s.db.prepare('SELECT COUNT(*) AS count FROM workbench_items').first(); assert.equal(all.count, 5);
});

test('旧测试绑定与结果不明请求移至隔离元数据，原 v2 文本和转换关联不删除；正式队列不受影响', async t => {
  const id = KNOWN_TEST_IDS[2], fake = { ...createTodo('已知测试', true, at), id }, note = { ...createNote('有关联的本机原文', at), convertedToId: id, convertedToType: 'todo', convertedAt: at };
  const s = fixture(t, [fake, note]); await s.store.read();
  const db = await new Promise(resolve => { const request = s.indexedDB.open('personal-workbench.local-sync.v1'); request.onsuccess = () => resolve(request.result); });
  await new Promise(resolve => {
    const tx = db.transaction('state', 'readwrite'), bucket = tx.objectStore('state');
    bucket.get('workbench').onsuccess = event => {
      const state = event.target.result; state.bindings[id] = { version: 1, base: fake }; state.dirty[id] = true;
      state.outbox[id] = { id, requestId: 'old-test-outbox', expectedVersion: 1, item: fake }; bucket.put(state, 'workbench');
    }; tx.oncomplete = resolve;
  }); db.close();
  const state = await s.store.activateOwnerPhone(true);
  assert.equal(state.outbox[id], undefined); assert.equal(state.bindings[id], undefined);
  assert.equal(state.testRecords[id].outbox.requestId, 'old-test-outbox'); assert.deepEqual(state.data.items, [fake, note]);
  assert.equal(await s.store.prepare(), null);
});

test('用户暂停后刷新不重新开启；其他分类保存不上传；手机后续新增待办自动排队', async t => {
  const s = fixture(t, [createNote('本机随笔', at)]); await s.store.activateOwnerPhone(true); await s.store.setEnabled(false);
  let state = await s.store.activateOwnerPhone(true); assert.equal(state.enabled, false);
  const todo = createTodo('暂停期间手机新增', false, at); await s.store.save(data([...state.data.items, todo]), state.revision);
  assert.equal((await s.store.read()).bindings[todo.id], undefined);
  await s.store.setEnabled(true); await s.engine.run(); state = await s.store.read();
  assert.equal(state.bindings[todo.id].version, 1); assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
  const added = createTodo('后续手机新增', true, at); await s.store.save(data([...state.data.items, added]), state.revision);
  await s.engine.run(); assert.equal((await s.service.getItem({ id: added.id })).item.urgent, true);
});
