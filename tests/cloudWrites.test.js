import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudWrites } from '../src/cloud/cloudWrites.js';
import { createWorkbenchApi, SaveError } from '../src/cloud/workbenchApi.js';
import { createProject, createTodo } from '../src/data/workbenchData.js';

const project = version => ({ item: createProject('虚构写入项目'), version });
const todo = () => ({ item: createTodo('虚构手机待办', false), version: 1 });
const later = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function setup(api, initialStorage = new Map()) {
  let connection = { source: 'cloud', auth: { canWrite: true, remembered: true }, readState: 'ready' };
  let subscriber;
  let reads = 0;
  const storage = { getItem: key => initialStorage.get(key), setItem: (key, value) => initialStorage.set(key, value) };
  const cloud = { getState: () => connection, subscribe(fn) { subscriber = fn; return () => {}; }, async refreshAfterWrite() { reads++; } };
  let ids = 0;
  const writer = createCloudWrites({ api, cloud, storage, randomId: () => `fake-request-${++ids}` });
  return { writer, storage: initialStorage, cloud, get reads() { return reads; }, change(patch) { connection = { ...connection, ...patch }; subscriber(connection); } };
}

test('结果不明保留输入及不可变原请求；刷新恢复后人工重试仍使用同一个 requestId', async () => {
  const payloads = [];
  const api = { async createTodo(body) { payloads.push(body); if (payloads.length === 1) throw new SaveError('unknown', 'fake unknown', { unknown: true }); return todo(); } };
  const s = setup(api);
  s.writer.editTodo({ title: '虚构手机待办' }); await s.writer.saveTodo();
  assert.equal(s.writer.getState().phase, 'unknown');
  s.writer.editTodo({ title: '不允许改变不明请求' });
  assert.equal(s.writer.getState().todo.title, '虚构手机待办');
  const restored = setup(api, s.storage);
  await restored.writer.retry();
  assert.deepEqual(payloads[0], payloads[1]);
  assert.equal(restored.writer.getState().phase, 'saved');
  assert.equal(restored.reads, 1); assert.equal(restored.writer.getState().todo.title, '');
});

test('项目冲突保留草稿；读取、人工采用最新基准后新请求只包含用户实际改动', async () => {
  const base = project(2); const latest = structuredClone(base); latest.version = 3; latest.item.nextStep = 'GPT 的较新下一步';
  const payloads = []; let reads = 0;
  const s = setup({ async getProject() { return reads++ ? latest : base; }, async updateProject(body) { payloads.push(body); if (payloads.length === 1) throw new SaveError('conflict', 'fake conflict'); return { item: { ...latest.item, ...body.fields }, version: 4 }; } });
  await s.writer.openProject(base.item.id); s.writer.editProject({ currentSituation: '手机草稿' }); await s.writer.saveProject();
  assert.equal(s.writer.getState().phase, 'conflict'); assert.equal(s.writer.getState().project.fields.currentSituation, '手机草稿');
  await s.writer.saveProject(); assert.equal(payloads.length, 1);
  await s.writer.loadLatest(); assert.equal(s.writer.getState().project.base.version, 2);
  s.writer.rebase(); assert.equal(s.writer.getState().project.fields.nextStep, 'GPT 的较新下一步');
  assert.equal(s.writer.getState().project.fields.currentSituation, '手机草稿'); assert.equal(payloads.length, 1);
  await s.writer.saveProject();
  assert.equal(payloads[1].expectedVersion, 3); assert.notEqual(payloads[0].requestId, payloads[1].requestId);
  assert.deepEqual(payloads[1].fields, { currentSituation: '手机草稿' });
});

test('保存已确认但重新读取失败，不把成功当成待重发；切本机或退出丢弃迟到保存结果', async () => {
  const s = setup({ async createTodo() { return todo(); } });
  s.cloud.refreshAfterWrite = async () => { s.change({ readState: 'failed' }); };
  s.writer.editTodo({ title: '虚构手机待办' }); await s.writer.saveTodo();
  assert.equal(s.writer.getState().pending, null); assert.match(s.writer.getState().message, /服务端已确认保存/);
  for (const patch of [{ source: 'local' }, { auth: { canWrite: false, remembered: false } }]) {
    const wait = later(); const current = setup({ createTodo: () => wait.promise });
    current.writer.editTodo({ title: '虚构手机待办' }); const saving = current.writer.saveTodo();
    current.change(patch); wait.resolve(todo()); await saving;
    assert.equal(current.writer.getState().phase, 'unknown'); assert.ok(current.writer.getState().pending);
    assert.equal(current.writer.getState().confirmed, null); assert.equal(current.reads, 0);
  }
});

test('网络失败和无法核对的成功响应都不自动重发；请求体与路径只含服务已支持操作', async () => {
  const bodies = []; let mode = 'offline'; const confirmed = todo();
  const api = createWorkbenchApi({ auth: { async getAccessToken() { return 'fake-access'; }, getStatus() { return { canWrite: true }; } }, fetcher: async (url, init) => {
    bodies.push({ path: new URL(url).pathname, body: JSON.parse(init.body), method: init.method });
    if (mode === 'offline') throw new TypeError('fake network');
    if (mode === 'invalid-success') return Response.json({ invalid: true });
    if (mode === 'conflict') return Response.json({ code: 'VERSION_CONFLICT' }, { status: 409 });
    return Response.json(confirmed, { status: 201 });
  } });
  const input = { requestId: 'fake-create-01', type: 'todo', title: '虚构手机待办' };
  await assert.rejects(api.createTodo(input), error => error.unknown); assert.equal(bodies.length, 1);
  mode = 'invalid-success'; await assert.rejects(api.createTodo(input), error => error.unknown); assert.equal(bodies.length, 2);
  mode = 'success'; await api.createTodo(input); assert.deepEqual(bodies[0].body, bodies[2].body);
  mode = 'conflict'; await assert.rejects(api.updateProject({ id: 'fake-project', requestId: 'fake-update-01', expectedVersion: 2, fields: { nextStep: '虚构' } }), error => error.kind === 'conflict' && !error.unknown);
  assert.equal(bodies[3].path, '/api/projects/fake-project'); assert.equal(bodies[3].method, 'PATCH'); assert.equal(Object.hasOwn(bodies[3].body, 'id'), false);
});

test('没有写权限时 API 不发写请求；无改动项目不写入，不改变本机存储', async () => {
  let calls = 0;
  const api = createWorkbenchApi({ auth: { async getAccessToken() { return 'fake-access'; }, getStatus() { return { canWrite: false }; } }, fetcher: () => { calls++; } });
  await assert.rejects(api.createTodo({}), error => error.kind === 'permission'); assert.equal(calls, 0);
  const base = project(2);
  const s = setup({ async getProject() { return base; }, async updateProject() { calls++; } });
  await s.writer.openProject(base.item.id); await s.writer.saveProject(); assert.equal(calls, 0);
  assert.ok([...s.storage.keys()].every(key => key === 'personal-workbench.cloud-drafts.v1'));
});
