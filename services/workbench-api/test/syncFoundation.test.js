import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from '../src/service.js';
import { D1Store } from '../src/store.js';
import { sqliteD1 } from './sqlite-d1.js';
import { handleApi } from '../src/http.js';
import { createTodo, createProject, updateProject } from '../../../src/data/workbenchData.js';

function setup(t) {
  const db = sqliteD1(); t.after(() => db.close());
  const store = new D1Store(db, 'owner-test');
  const service = new WorkbenchService(store, { id: 'owner-test', scopes: [READ_SCOPE, WRITE_SCOPE] });
  return { db, store, service };
}
const id = () => crypto.randomUUID();

test('同步快照保留离线操作时间及已有历史，严格校验分类/字段/所有者；无实际变化不增加版本', async t => {
  const { db, service } = setup(t);
  const project = updateProject(createProject('虚构离线项目', {}, '2026-10-25T08:00:00.000Z'), { currentSituation: '离线推进' }, '2026-10-25T09:00:00.000Z');
  const input = { id: project.id, requestId: 'snapshot-create-1', expectedVersion: 0, item: project };
  const created = await service.sync(input); assert.deepEqual(created.item, project);
  assert.deepEqual(await service.sync(input), created);
  const unchanged = await service.sync({ ...input, requestId: 'snapshot-noop-1', expectedVersion: 1, item: { ...project, tags: [] } });
  assert.equal(unchanged.version, 1); assert.equal((await service.changes({})).changes.length, 1);
  await assert.rejects(service.sync({ ...input, requestId: 'snapshot-time-bad', expectedVersion: 1, item: { ...project, createdAt: '2026-10-24T08:00:00.000Z' } }), { code: 'IMMUTABLE_FIELD' });
  await assert.rejects(service.sync({ ...input, requestId: 'snapshot-extra-bad', item: { ...project, ownerId: 'another-owner' } }));
  const readOnly = new WorkbenchService(new D1Store(db, 'owner-test'), { id: 'owner-test', scopes: [READ_SCOPE] });
  await assert.rejects(readOnly.sync(input), { code: 'INSUFFICIENT_SCOPE' });
  const todo = createTodo('虚构离线待办', true, '2026-10-25T08:00:00.000Z');
  const route = `https://workbench.test/api/sync/items/${todo.id}`;
  const response = await handleApi(new Request(route, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'snapshot-http-1', expectedVersion: 0, item: todo }) }), service, 'https://workbench.test');
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).item, todo);
  await service.deleteItem({ id: todo.id, requestId: 'snapshot-delete-1', expectedVersion: 1 });
  const tombstone = await (await handleApi(new Request(route), service, 'https://workbench.test')).json();
  assert.deepEqual(tombstone, { id: todo.id, deleted: true, version: 2 });
});

test('稳定 ID 创建、普通编辑、明确完成/恢复和原请求重试保持版本与唯一变更', async t => {
  const { service } = setup(t);
  const itemId = id();
  const created = await service.create({ id: itemId, requestId: 'sync-create-1', type: 'todo', title: '虚构同步' });
  assert.equal(created.item.id, itemId);
  const edit = { id: itemId, requestId: 'sync-edit-1', expectedVersion: 1, fields: { title: '离线改名', urgent: true } };
  const edited = await service.patchItem(edit); assert.equal(edited.version, 2);
  assert.deepEqual(await service.patchItem(edit), edited);
  const complete = { id: itemId, requestId: 'sync-done-1', expectedVersion: 2, done: true };
  const done = await service.completeItem(complete); assert.equal(done.version, 3); assert.equal(done.item.done, true);
  assert.deepEqual(await service.completeItem(complete), done);
  const noop = await service.completeItem({ ...complete, requestId: 'sync-done-noop', expectedVersion: 3 });
  assert.equal(noop.version, 3);
  const restored = await service.completeItem({ ...complete, requestId: 'sync-restore-1', expectedVersion: 3, done: false });
  assert.equal(restored.version, 4); assert.equal(restored.item.completedAt, null); assert.equal(restored.item.urgent, true);
  const feed = await service.changes({}); assert.equal(feed.changes.length, 4);
  await assert.rejects(service.patchItem({ ...edit, requestId: 'sync-stale-1' }), { code: 'VERSION_CONFLICT' });
  await assert.rejects(service.patchItem({ ...edit, fields: { title: '同 ID 不同内容' } }), { code: 'REQUEST_ID_REUSED' });
});

test('删除墓碑与幂等回执不允许旧设备复活，另一所有者看不到记录或变更', async t => {
  const { db, service } = setup(t); const itemId = id();
  await service.create({ id: itemId, requestId: 'delete-create-1', type: 'todo', title: '虚构删除' });
  const input = { id: itemId, requestId: 'delete-request-1', expectedVersion: 1 };
  const removed = await service.deleteItem(input);
  assert.deepEqual(removed, { id: itemId, version: 2, deleted: true });
  assert.deepEqual(await service.deleteItem(input), removed);
  await assert.rejects(service.getItem({ id: itemId }), { code: 'ITEM_DELETED' });
  await assert.rejects(service.create({ id: itemId, requestId: 'resurrect-request-1', type: 'todo', title: '不能复活' }), { code: 'ITEM_DELETED' });
  assert.equal((await service.list({ includeCompleted: true })).items.length, 0);
  const feed = await service.changes({}); assert.equal(feed.changes.length, 2); assert.equal(feed.changes[1].deleted, true); assert.equal(feed.changes[1].record, null);
  const other = new WorkbenchService(new D1Store(db, 'other-owner'), { id: 'other-owner', scopes: [READ_SCOPE] });
  assert.deepEqual((await other.changes({})).changes, []);
});

test('分页固定高水位，不把分页期间新写入挤进旧游标，也不漏下一轮修改', async t => {
  const { service } = setup(t);
  for (let n = 0; n < 3; n++) await service.create({ requestId: `feed-create-${n}`, type: 'todo', title: `虚构${n}` });
  const page1 = await service.changes({ limit: 1 }); assert.equal(page1.hasMore, true);
  await service.create({ requestId: 'feed-later-1', type: 'todo', title: '分页期间新建' });
  const page2 = await service.changes({ since: page1.cursor, until: page1.until, limit: 100 });
  assert.equal(page2.changes.length, 2); assert.equal(page2.hasMore, false); assert.equal(page2.cursor, page1.until);
  const next = await service.changes({ since: page2.cursor }); assert.equal(next.changes.length, 1);
  assert.equal(next.changes[0].record.item.title, '分页期间新建');
  await assert.rejects(service.changes({ since: '999' }), { code: 'INVALID_CURSOR' });
});

test('非法分类字段、只读写入被拒，REST 接口保留业务错误，项目历史规则不变', async t => {
  const { db, service } = setup(t);
  const note = await service.create({ requestId: 'patch-note-1', type: 'note', title: '虚构随笔' });
  await assert.rejects(service.patchItem({ id: note.item.id, requestId: 'patch-note-bad', expectedVersion: 1, fields: { urgent: true } }), { code: 'INVALID_INPUT' });
  const readOnly = new WorkbenchService(new D1Store(db, 'owner-test'), { id: 'owner-test', scopes: [READ_SCOPE] });
  await assert.rejects(readOnly.deleteItem({ id: note.item.id, requestId: 'readonly-delete', expectedVersion: 1 }), { code: 'INSUFFICIENT_SCOPE' });
  const response = await handleApi(new Request(`https://workbench.test/api/items/${note.item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'http-patch-note', expectedVersion: 1, fields: { title: 'REST 修改' } }) }), service, 'https://workbench.test');
  assert.equal(response.status, 200); assert.equal((await response.json()).version, 2);
  const project = await service.create({ requestId: 'feed-project-1', type: 'project', title: '虚构项目' });
  const updated = await service.updateProject({ id: project.item.id, requestId: 'feed-project-update', expectedVersion: 1, fields: { currentSituation: '沿用原机制' } });
  assert.equal(updated.item.updates.length, 2);
  const feedResponse = await handleApi(new Request('https://workbench.test/api/changes?since=0&limit=100'), service, 'https://workbench.test');
  assert.equal(feedResponse.status, 200); assert.equal((await feedResponse.json()).changes.at(-1).record.version, 2);
});

test('删除转换目标原子解除随笔关联，并发布该随笔的新版本', async t => {
  const { db, service } = setup(t);
  const target = await service.create({ requestId: 'linked-target-1', type: 'todo', title: '虚构转换目标' });
  const note = await service.create({ requestId: 'linked-note-1', type: 'note', title: '保留原文' });
  const linked = { ...note.item, convertedToId: target.item.id, convertedToType: 'todo', convertedAt: new Date().toISOString() };
  await db.prepare('UPDATE workbench_items SET item_json = ? WHERE owner_id = ? AND item_id = ?').bind(JSON.stringify(linked), 'owner-test', note.item.id).run();
  const renamed = await service.patchItem({ id: note.item.id, requestId: 'linked-rename-1', expectedVersion: 1, fields: { title: '改名但保留原文' } });
  assert.equal(renamed.item.convertedToId, target.item.id);
  await service.deleteItem({ id: target.item.id, requestId: 'linked-delete-1', expectedVersion: 1 });
  const latest = await service.getItem({ id: note.item.id });
  assert.equal(latest.version, 3); assert.equal(latest.item.title, '改名但保留原文'); assert.equal(latest.item.convertedToId, undefined);
  const change = (await service.changes({})).changes.at(-1);
  assert.equal(change.id, note.item.id); assert.equal(change.record.version, 3); assert.equal(change.record.item.convertedToId, undefined);
});
