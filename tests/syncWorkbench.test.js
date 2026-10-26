import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createSyncStore } from '../src/sync/syncStore.js';
import { createSyncEngine } from '../src/sync/syncEngine.js';
import { createSyncApi } from '../src/sync/syncApi.js';
import { createTodo, createProject, createNote, createRoutine, renameItem, toggleTodo, updateProject, STORAGE_KEY } from '../src/data/workbenchData.js';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from '../services/workbench-api/src/service.js';
import { D1Store } from '../services/workbench-api/src/store.js';
import { sqliteD1 } from '../services/workbench-api/test/sqlite-d1.js';
import { handleApi } from '../services/workbench-api/src/http.js';

const at = '2026-10-26T08:00:00.000Z';
const data = items => ({ schemaVersion: 2, items });
function memoryStorage(value = null) { let raw = value; return { getItem: () => raw, setItem: (_key, value) => { raw = value; } }; }
function setup(t, items = []) {
  const indexedDB = new IDBFactory(), storage = memoryStorage(JSON.stringify(data(items)));
  const store = createSyncStore({ indexedDB, storage, ownerPhone: true });
  const db = sqliteD1();
  const service = new WorkbenchService(new D1Store(db, 'fictional-owner'), { id: 'fictional-owner', scopes: [READ_SCOPE, WRITE_SCOPE] });
  const controls = { online: true, workerFailure: null, loseReply: false, corruptReply: false, denied: false, calls: [], statuses: [] };
  const api = createSyncApi({ issuer: 'https://sync.test', auth: { getAccessToken: async () => 'fake-local-test-access', getStatus: () => ({ canWrite: !controls.denied }) },
    async fetcher(url, init) {
      controls.calls.push({ path: url.pathname, method: init.method, body: init.body });
      if (!controls.online) throw new TypeError('fictional network unavailable');
      if (controls.workerFailure === 'network') throw new TypeError('fictional Worker unreachable while online');
      if (controls.workerFailure === '503') return Response.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
      const response = await handleApi(new Request(url, init), service, 'https://sync.test');
      if (controls.loseReply && init.method === 'PUT') { controls.loseReply = false; throw new TypeError('fictional reply lost after commit'); }
      if (controls.corruptReply && init.method === 'PUT') { controls.corruptReply = false; const value = await response.json(); return Response.json({ ...value, item: { ...value.item, title: '错误回执内容' } }); }
      return response;
    },
  });
  const engine = createSyncEngine({ store, api, isOnline: () => controls.online, onStatus: value => controls.statuses.push(value), schedule: () => 1, cancel: () => {} });
  t.after(async () => { engine.stop(); await store.close(); db.close(); });
  return { indexedDB, storage, store, service, api, engine, controls };
}
async function add(store, item) { const state = await store.read(); return store.save(data([...state.data.items, item]), state.revision); }
async function change(store, id, operation) { const state = await store.read(); return store.save(data(state.data.items.map(item => item.id === id ? operation(item) : item)), state.revision); }

test('浏览器保持 online 但 Worker 连接失败/503 时明确显示同步失败与待同步，保留原请求并在恢复后唯一提交', async t => {
  for (const failure of ['network', '503']) await t.test(failure, async t => {
    const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
    const todo = createTodo(`虚构 Worker 失败 ${failure}`, false, at); await add(s.store, todo);
    s.controls.workerFailure = failure;
    await s.engine.run();
    const state = await s.store.read();
    assert.equal(s.controls.online, true); assert.equal(s.controls.statuses.at(-1).phase, 'failed');
    assert.match(s.controls.statuses.at(-1).message, /同步失败.*待同步/);
    assert.ok(state.dirty[todo.id]); assert.ok(state.outbox[todo.id]); assert.equal(state.data.items[0].title, todo.title);
    assert.equal((await s.service.list({ includeCompleted: true })).items.length, 0);
    const first = s.controls.calls.find(call => call.method === 'PUT');
    s.controls.workerFailure = null; await s.engine.run();
    const writes = s.controls.calls.filter(call => call.method === 'PUT'); assert.equal(writes[1].body, first.body);
    assert.deepEqual((await s.store.read()).dirty, {}); assert.equal(s.controls.statuses.at(-1).phase, 'ready');
    assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
  });
});

test('首次初始化保留原 v2 与正式事项；只在开启后自动纳入新建待办/项目，旧事项需带版本的明确预览确认', async t => {
  const formal = createTodo('虚构的既有本机记录', false, at), s = setup(t, [formal]);
  const original = s.storage.getItem(STORAGE_KEY);
  let state = await s.store.read(); assert.deepEqual(state.data.items, [formal]); assert.deepEqual(state.bindings, {});
  await s.store.setEnabled(true);
  const note = createRoutine('本批不纳入的分类', at); await add(s.store, note);
  const todo = createTodo('开启后新建', true, at); await add(s.store, todo);
  await s.engine.run();
  assert.deepEqual((await s.service.list({ includeCompleted: true })).items.map(r => r.item.id), [todo.id]);
  state = await s.store.read(); assert.equal(state.bindings[formal.id], undefined); assert.equal(state.bindings[note.id], undefined);
  await assert.rejects(s.store.enroll([formal.id], state.revision - 1), /预览|更新/);
  await s.store.enroll([formal.id], state.revision); await s.engine.run();
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 2);
  assert.equal(s.storage.getItem(STORAGE_KEY), original);
});

test('断网编辑、完成和恢复先落盘；重开仓库后补传，保留本机创建时间；GPT 更新经变更流回到同一首页集合', async t => {
  const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
  s.controls.online = false;
  const todo = createTodo('离线虚构待办', true, at); await add(s.store, todo);
  await change(s.store, todo.id, item => toggleTodo(renameItem(item, '离线已改名'), '2026-10-26T08:01:00.000Z'));
  await s.engine.run(); assert.equal(s.controls.calls.length, 0);
  const reopened = createSyncStore({ indexedDB: s.indexedDB, storage: s.storage }); t.after(() => reopened.close());
  assert.equal((await reopened.read()).data.items[0].done, true);
  s.controls.online = true; await s.engine.run();
  let record = await s.service.getItem({ id: todo.id }); assert.equal(record.item.createdAt, at); assert.equal(record.item.done, true);
  await s.service.patchItem({ id: todo.id, requestId: 'fictional-gpt-edit-1', expectedVersion: record.version, fields: { title: 'GPT 虚构修改' } });
  await s.engine.run();
  assert.equal((await s.store.read()).data.items[0].title, 'GPT 虚构修改');
  await change(s.store, todo.id, item => toggleTodo(item, '2026-10-26T08:02:00.000Z')); await s.engine.run();
  record = await s.service.getItem({ id: todo.id }); assert.equal(record.item.done, false); assert.equal(record.item.completedAt, null);
});

test('服务端已提交但响应丢失时，刷新和重试使用同一请求体与 requestId，不重复创建或追加项目历史', async t => {
  const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
  const project = createProject('虚构重试项目', { currentSituation: '离线推进' }, at); await add(s.store, project);
  s.controls.loseReply = true; await s.engine.run();
  const before = (await s.store.read()).outbox[project.id]; assert.ok(before);
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 1);
  await s.engine.run();
  const puts = s.controls.calls.filter(call => call.method === 'PUT'); assert.equal(puts.length, 2); assert.equal(puts[0].body, puts[1].body);
  const record = await s.service.getProject({ id: project.id }); assert.equal(record.version, 1); assert.deepEqual(record.item.updates, project.updates);
  assert.deepEqual((await s.store.read()).dirty, {});
});

test('发送过程中继续本机编辑：旧回执不覆盖新内容，下一轮使用新版本提交', async t => {
  const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
  const todo = createTodo('发送前', false, at); await add(s.store, todo);
  const job = await s.store.prepare(); const response = await s.api.send(job);
  await change(s.store, todo.id, item => renameItem(item, '发送过程中又修改'));
  await s.store.acknowledge(job, response);
  assert.equal((await s.store.read()).data.items[0].title, '发送过程中又修改');
  const next = await s.store.prepare(); assert.equal(next.expectedVersion, 1); assert.notEqual(next.requestId, job.requestId);
  await s.engine.run(); assert.equal((await s.service.getItem({ id: todo.id })).item.title, '发送过程中又修改');
  await s.store.acknowledge(job, response); assert.equal((await s.store.read()).bindings[todo.id].version, 2);
});

test('成功状态但回执内容与原请求不符时不清队列、不改本机，后续自动重放核对唯一提交', async t => {
  const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
  const todo = createTodo('虚构回执核对', false, at); await add(s.store, todo);
  s.controls.corruptReply = true; await s.engine.run();
  let state = await s.store.read(); assert.ok(state.outbox[todo.id]); assert.equal(state.data.items[0].title, todo.title);
  await s.engine.run(); state = await s.store.read(); assert.deepEqual(state.dirty, {});
  const writes = s.controls.calls.filter(value => value.method === 'PUT'); assert.equal(writes[0].body, writes[1].body);
  assert.equal((await s.service.getItem({ id: todo.id })).version, 1);
});

test('项目版本冲突保留双方及离线历史，其他记录继续同步；人工采用云端时保留本机副本且不自动上传', async t => {
  const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
  const project = createProject('冲突虚构项目', { currentSituation: '基准' }, at); await add(s.store, project); await s.engine.run();
  await change(s.store, project.id, item => updateProject(item, { currentSituation: '手机离线推进' }, '2026-10-26T08:03:00.000Z'));
  await s.service.updateProject({ id: project.id, requestId: 'fictional-gpt-conflict', expectedVersion: 1, fields: { currentSituation: 'GPT 同时推进' } });
  const other = createTodo('冲突不阻塞其他事项', false, at); await add(s.store, other);
  await s.engine.run();
  let state = await s.store.read();
  assert.equal(state.data.items.find(item => item.id === project.id).currentSituation, '手机离线推进');
  assert.equal(state.blocked[project.id].remote.item.currentSituation, 'GPT 同时推进');
  assert.equal((await s.service.getItem({ id: other.id })).version, 1);
  await s.store.resolveWithCopy(project.id, state.revision); state = await s.store.read();
  const localCopy = state.data.items.find(item => item.title.endsWith('（冲突副本）'));
  assert.equal(localCopy.currentSituation, '手机离线推进'); assert.equal(state.bindings[localCopy.id], undefined);
  assert.equal(state.archive.length, 1); await s.engine.run();
  assert.equal((await s.service.list({ includeCompleted: true })).items.length, 2);
});

test('删除标记拉取后旧设备不能复活；本机删除结果不明重复发送仍只删除一次', async t => {
  const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
  const todo = createTodo('虚构删除', false, at); await add(s.store, todo); await s.engine.run();
  const state = await s.store.read(); await s.store.save(data([]), state.revision);
  const job = await s.store.prepare(); const removed = await s.api.send(job); assert.equal(removed.deleted, true);
  assert.deepEqual(await s.api.send(job), removed); await s.store.acknowledge(job, removed);
  await s.engine.run(); assert.equal((await s.store.read()).data.items.length, 0);
  await add(s.store, { ...todo, title: '旧 ID 复活尝试' }); await s.engine.run();
  assert.equal((await s.store.read()).blocked[todo.id].remote.deleted, true);
  await assert.rejects(s.service.getItem({ id: todo.id }), { code: 'ITEM_DELETED' });
});

test('多窗口事务版本拒绝旧快照；坏保存不改事项或队列；旧版窗口写 v2 后暂停而不覆盖', async t => {
  const s = setup(t); const a = await s.store.read(), b = await s.store.read();
  const todo = createTodo('窗口 A', false, at); await s.store.save(data([todo]), a.revision);
  await assert.rejects(s.store.save(data([createTodo('窗口 B', false, at)]), b.revision), /另一个窗口/);
  let state = await s.store.read();
  await assert.rejects(s.store.save(data([{ ...todo, createdAt: 'bad' }]), state.revision));
  assert.deepEqual((await s.store.read()).data.items, [todo]);
  s.storage.setItem(STORAGE_KEY, JSON.stringify(data([createTodo('旧窗口另存', false, at)])));
  await assert.rejects(s.store.read(), /旧版窗口/);
});

test('暂停/退出时迟到响应不清队列，断网期间不循环跳转；缺写权限保留待同步事项', async t => {
  const s = setup(t); await s.store.read(); await s.store.setEnabled(true);
  const todo = createTodo('虚构退出竞态', false, at); await add(s.store, todo);
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const engine = createSyncEngine({ store: s.store, api: { ...s.api, async send(job) { const response = await s.api.send(job); await waiting; return response; } }, schedule: () => 1, cancel: () => {} });
  t.after(() => engine.stop()); const active = engine.run();
  while (!s.controls.calls.some(call => call.method === 'PUT')) await new Promise(resolve => setTimeout(resolve, 1));
  engine.interrupt(); await s.store.setEnabled(false); release(); await active;
  assert.ok((await s.store.read()).outbox[todo.id]);
  await s.store.setEnabled(true); s.controls.denied = true; await s.engine.run();
  assert.equal(s.controls.statuses.at(-1).phase, 'permission'); assert.ok((await s.store.read()).dirty[todo.id]);
  s.controls.denied = false; await s.engine.run(); assert.deepEqual((await s.store.read()).dirty, {});
});
