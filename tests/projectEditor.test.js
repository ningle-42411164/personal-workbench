import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectEditor } from '../src/data/projectEditor.js';
import { createProject } from '../src/data/workbenchData.js';

function setup() {
  let project = createProject('虚构弹窗项目', { status: 'active', currentSituation: '原情况', nextStep: '原下一步' });
  const state = { field: null, draft: '', error: '', busy: false };
  let writes = 0, confirms = 0;
  const controls = { fail: false, allowed: true, confirm: true, throw: false };
  const editor = createProjectEditor({ state, getProject: () => project, canEdit: () => controls.allowed,
    async saveProject(next) { writes++; if (controls.throw) throw new Error('虚构配额故障'); if (controls.fail) return false; project = next; return true; },
    confirmComplete() { confirms++; return controls.confirm; },
  });
  return { state, editor, controls, get project() { return project; }, get writes() { return writes; }, get confirms() { return confirms; } };
}

test('同字段重入不重置；切换字段先保存实际改动，仅当前情况追加一次历史', async () => {
  const s = setup(); await s.editor.begin('currentSituation'); s.state.draft = '未保存推进';
  await s.editor.begin('currentSituation'); assert.equal(s.state.draft, '未保存推进'); assert.equal(s.writes, 0);
  assert.equal(await s.editor.begin('nextStep'), true);
  assert.equal(s.project.currentSituation, '未保存推进'); assert.equal(s.project.updates.length, 2);
  s.state.draft = '新的下一步'; await s.editor.commit();
  assert.equal(s.project.nextStep, '新的下一步'); assert.equal(s.project.updates.length, 2);
});

test('编辑期间同一字段被云端更新时保留输入并阻止自动覆盖，其他字段变化仍可合并', async () => {
  const s = setup(); await s.editor.begin('currentSituation'); s.state.draft = '未提交的本机输入';
  s.project.currentSituation = '云端新推进';
  assert.equal(await s.editor.commit(), false); assert.equal(s.writes, 0);
  assert.equal(s.state.draft, '未提交的本机输入'); assert.equal(s.state.field, 'currentSituation');
  assert.match(s.state.error, /云端修改|云端修改|其他窗口或云端/);
  s.editor.cancel(); await s.editor.begin('nextStep'); s.state.draft = '本机下一步';
  s.project.currentSituation = '云端另一个字段';
  assert.equal(await s.editor.commit(), true); assert.equal(s.project.currentSituation, '云端另一个字段');
});

test('保存失败阻止切字段、关闭和完成，保留输入及编辑状态；恢复后可重试', async () => {
  const s = setup(); await s.editor.begin('currentSituation'); s.state.draft = '失败也应保留'; s.controls.fail = true;
  assert.equal(await s.editor.begin('nextStep'), false);
  assert.equal(await s.editor.commit(), false); // 外壳 ×、遮罩、Esc 共用此检查。
  assert.equal(await s.editor.complete(), false);
  assert.equal(s.confirms, 0); assert.equal(s.project.currentSituation, '原情况');
  assert.equal(s.state.field, 'currentSituation'); assert.equal(s.state.draft, '失败也应保留'); assert.match(s.state.error, /保存失败/);
  s.controls.fail = false; assert.equal(await s.editor.commit(), true);
  assert.equal(s.project.currentSituation, '失败也应保留'); assert.equal(s.project.updates.length, 2);
  assert.equal(s.state.field, null);
});

test('坏字段和存储抛错不丢草稿；无实际变化不写入、不增加历史', async () => {
  const s = setup(); const original = s.project;
  await s.editor.begin('currentSituation'); assert.equal(await s.editor.commit(), true);
  assert.equal(s.project, original); assert.equal(s.writes, 0);
  await s.editor.begin('dueDate'); s.state.draft = '2026-02-30';
  assert.equal(await s.editor.commit(), false); assert.equal(s.state.draft, '2026-02-30'); assert.equal(s.writes, 0);
  s.editor.cancel(); await s.editor.begin('title'); s.state.draft = '虚构改名'; s.controls.throw = true;
  assert.equal(await s.editor.commit(), false); assert.equal(s.state.field, 'title'); assert.equal(s.state.draft, '虚构改名');
  assert.equal(s.project, original);
});

test('完成先提交当前情况，再基于最新项目写完成状态；不丢字段或重复历史', async () => {
  const s = setup(); await s.editor.begin('currentSituation'); s.state.draft = '完成之前的推进';
  assert.equal(await s.editor.complete(), true);
  assert.equal(s.project.currentSituation, '完成之前的推进'); assert.equal(s.project.status, 'done');
  assert.ok(s.project.completedAt); assert.equal(s.project.updates.length, 2); assert.equal(s.confirms, 1);
  assert.equal(await s.editor.complete(), true); assert.equal(s.writes, 2); assert.equal(s.project.updates.length, 2);
});

test('主动取消只放弃当前未提交字段；此前自动保存的字段仍保留', async () => {
  const s = setup(); await s.editor.begin('currentSituation'); s.state.draft = '先前已保存';
  await s.editor.begin('nextStep'); s.state.draft = '这次主动取消'; s.editor.cancel();
  assert.equal(s.project.currentSituation, '先前已保存'); assert.equal(s.project.nextStep, '原下一步');
  assert.equal(s.state.field, null); assert.equal(s.writes, 1);
});

test('并发离开不重复保存；完成确认取消时仍保留状态草稿', async () => {
  const s = setup(); await s.editor.begin('currentSituation'); s.state.draft = '并发关闭';
  const results = await Promise.all([s.editor.commit(), s.editor.commit()]);
  assert.deepEqual(results, [true, false]); assert.equal(s.writes, 1); assert.equal(s.project.updates.length, 2);
  await s.editor.begin('status'); s.state.draft = 'done'; s.controls.confirm = false;
  assert.equal(await s.editor.commit(), false); assert.equal(s.project.status, 'active'); assert.equal(s.state.field, 'status'); assert.equal(s.state.draft, 'done');
});
