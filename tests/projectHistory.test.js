import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, updateProject, validateWorkbenchData } from '../src/data/workbenchData.js';
import { syncSchema, syncItem, patchProject } from '../services/workbench-api/src/domain.js';

const before = '2026-10-01T00:00:00.000Z', now = '2026-11-10T12:00:00.000Z';
test('旧历史不推断类型，旧非空字段覆盖前留档，后续只追加新版本；清空仍可备份和同步', () => {
  const old = createProject('旧项目', { currentSituation: '旧情况', nextStep: '旧计划' }, before);
  old.updates.push({ id: 'legacy', content: '旧情况', createdAt: before });
  const next = updateProject(old, { currentSituation: '', nextStep: '新计划' }, now);
  assert.deepEqual(next.updates.slice(0, 2), old.updates);
  assert.deepEqual(next.updates.slice(2).map(x => [x.field,x.kind,x.content,x.createdAt]), [
    ['currentSituation','archive','旧情况',now], ['currentSituation','change','',now],
    ['nextStep','archive','旧计划',now], ['nextStep','change','新计划',now],
  ]);
  const again = updateProject(next, { nextStep: '' }, now);
  assert.equal(again.updates.length, next.updates.length + 1);
  assert.equal(again.currentSituation, '');
  assert.equal(updateProject(again, { nextStep: '' }), again);
  assert.deepEqual(updateProject(again, { title: '改标题' }).updates, again.updates);
  validateWorkbenchData(JSON.parse(JSON.stringify({ schemaVersion: 2, items: [again] })));
  const request = syncSchema.parse({ requestId:'history-sync-001', id:again.id, expectedVersion:1, item:again });
  assert.deepEqual(syncItem(request, old).updates, again.updates);
  // 旧客户端及旧队列的无类型历史仍被严格结构接受。
  assert.doesNotThrow(() => syncSchema.parse({ ...request, item:old }));
  assert.throws(() => syncSchema.parse({ ...request, item:{...again, updates:[{...again.updates.at(-1), extra:true}]} }));
  assert.throws(() => validateWorkbenchData({schemaVersion:2,items:[{...again,updates:[{id:'bad',content:'',createdAt:now,field:'nextStep'}]}]}));
});
test('服务端与 MCP 共用更新入口，两种首次填入分别留痕且不改另一个字段', () => {
  const project = createProject('新项目', {}, before);
  const next = patchProject(project, { nextStep:'计划' });
  assert.equal(next.currentSituation, undefined);
  assert.equal(next.updates.at(-1).field, 'nextStep');
  const current = patchProject(next, { currentSituation:'进展' });
  assert.equal(current.nextStep, '计划');
  assert.equal(current.updates.at(-1).field, 'currentSituation');
});
