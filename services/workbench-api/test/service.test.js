import test from 'node:test';
import assert from 'node:assert/strict';
import { D1Store } from '../src/store.js';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from '../src/service.js';
import { sqliteD1 } from './sqlite-d1.js';

function setup(t, id = '275953771', scopes = [READ_SCOPE, WRITE_SCOPE]) {
  const db = sqliteD1(); t.after(() => db.close());
  return { db, store: new D1Store(db, id), service: new WorkbenchService(new D1Store(db, id), { id, scopes }) };
}

test('创建、读取、项目更新复用现有字段和历史语义', async t => {
  const { service } = setup(t);
  const created = await service.create({ requestId: 'create-project-1', type: 'project', title: '  云实验  ', tags: ['#代码', '代码'] });
  assert.equal(created.item.title, '云实验');
  assert.deepEqual(created.item.tags, ['代码']);
  assert.equal(created.item.updates.length, 1);
  const updated = await service.updateProject({ requestId: 'update-project-1', id: created.item.id, expectedVersion: 1,
    fields: { currentSituation: '已接通读取', nextStep: '验证写入' } });
  assert.equal(updated.version, 2);
  assert.equal(updated.item.updates.length, 2);
  assert.equal(updated.item.createdAt, created.item.createdAt);
  assert.equal(updated.item.updates[0].id, created.item.updates[0].id);
  assert.deepEqual(await service.getProject({ id: created.item.id }), updated);
});

test('重复创建和重复更新只提交一次；同标识换内容拒绝', async t => {
  const { service } = setup(t);
  const input = { requestId: 'same-create-1', type: 'project', title: '项目' };
  const first = await service.create(input);
  assert.deepEqual(await service.create(input), first);
  assert.equal((await service.list({})).items.length, 1);
  await assert.rejects(service.create({ ...input, title: '不同内容' }), { code: 'REQUEST_ID_REUSED' });
  const patch = { requestId: 'same-update-1', id: first.item.id, expectedVersion: 1, fields: { currentSituation: '完成一步' } };
  const second = await service.updateProject(patch);
  assert.deepEqual(await service.updateProject(patch), second);
  assert.equal(second.item.updates.length, 2);
});

test('两个并发创建使用同一请求标识时只产生一条记录', async t => {
  const { service } = setup(t);
  const input = { requestId: 'parallel-create-1', type: 'todo', title: '只创建一次' };
  const [a, b] = await Promise.all([service.create(input), service.create(input)]);
  assert.equal(a.item.id, b.item.id);
  assert.equal((await service.list({})).items.length, 1);
});

test('两个写入者使用同一旧版本，只有一个成功且不丢失最新内容', async t => {
  const { service } = setup(t);
  const created = await service.create({ requestId: 'race-create-1', type: 'project', title: '并发项目' });
  const results = await Promise.allSettled(['A', 'B'].map(label => service.updateProject({
    requestId: `race-update-${label}`, id: created.item.id, expectedVersion: 1, fields: { currentSituation: label },
  })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'VERSION_CONFLICT');
  const latest = await service.getProject({ id: created.item.id });
  assert.equal(latest.version, 2);
  assert.equal(latest.item.updates.length, 2);
  await assert.rejects(service.updateProject({ requestId: 'stale-update-1', id: created.item.id, expectedVersion: 1, fields: { title: '旧快照' } }), { code: 'VERSION_CONFLICT' });
});

test('无实际修改不增加版本或项目历史', async t => {
  const { service } = setup(t);
  const created = await service.create({ requestId: 'noop-create-1', type: 'project', title: '不改动' });
  const result = await service.updateProject({ requestId: 'noop-update-1', id: created.item.id, expectedVersion: 1, fields: { title: '不改动' } });
  assert.equal(result.version, 1);
  assert.equal(result.item.updates.length, 1);
});

test('读写权限独立检查，不能由参数伪造所有者', async t => {
  const { db, service } = setup(t);
  const readOnly = new WorkbenchService(new D1Store(db, '275953771'), { id: '275953771', scopes: [READ_SCOPE] });
  assert.equal((await readOnly.list({})).items.length, 0);
  await assert.rejects(readOnly.create({ requestId: 'no-write-1', type: 'todo', title: '拒绝' }), { code: 'INSUFFICIENT_SCOPE' });
  await assert.rejects(service.create({ requestId: 'fake-owner-1', type: 'todo', title: '拒绝', ownerId: 'another' }), error => error.name === 'ZodError');
  const created = await service.create({ requestId: 'private-create-1', type: 'project', title: '私有项目' });
  const other = new WorkbenchService(new D1Store(db, 'other'), { id: 'other', scopes: [READ_SCOPE] });
  assert.equal((await other.list({})).items.length, 0);
  await assert.rejects(other.getProject({ id: created.item.id }), { code: 'NOT_FOUND' });
});

test('非法日期、字段、系统标签与空名称均不写入', async t => {
  const { service } = setup(t);
  for (const payload of [
    { type: 'todo', title: ' ' }, { type: 'importantDate', title: '缺日期' },
    { type: 'importantDate', title: '坏日期', targetDate: '2026-02-30' },
    { type: 'note', title: '错误字段', urgent: true },
    { type: 'todo', title: '系统标签', tags: ['优先处理'] },
    { type: 'project', title: '非法字段', fields: { updates: [] } },
  ]) await assert.rejects(service.create({ requestId: crypto.randomUUID(), ...payload }));
  assert.equal((await service.list({})).items.length, 0);
});

test('所有现有分类可创建；分页和完成筛选不遗漏基本状态', async t => {
  const { service } = setup(t);
  for (const type of ['todo', 'note', 'routine', 'importantDate', 'project', 'waiting', 'shopping', 'creation']) {
    await service.create({ requestId: crypto.randomUUID(), type, title: type,
      ...(type === 'importantDate' ? { targetDate: '2026-12-01' } : {}),
      ...(type === 'project' ? { fields: { status: 'done' } } : {}) });
  }
  assert.equal((await service.list({ includeCompleted: true })).items.length, 8);
  assert.equal((await service.list({})).items.length, 7);
  assert.equal((await service.list({ limit: 2 })).nextOffset, 2);
  assert.equal((await service.list({ type: 'todo' })).items.length, 1);
});

test('数据库故障不会返回成功或吞掉错误', async t => {
  const { service, store } = setup(t);
  store.db.batch = async () => { throw new Error('simulated failure'); };
  // service 与 store 共用同一个 db；失败的事务不会生成成功回执。
  await assert.rejects(service.create({ requestId: 'failed-create-1', type: 'todo', title: '重试' }), /simulated failure/);
  assert.equal((await service.list({})).items.length, 0);
});
