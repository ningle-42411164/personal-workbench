import test from 'node:test';
import assert from 'node:assert/strict';
import { rejectionDetails } from '../src/sync/rejectionDetails.js';

test('拒绝详情只读投影原请求，保留零版本，不泄露无关字段', () => {
  const snapshot = { blocked: { x: { code: 'IMMUTABLE_FIELD' } }, outbox: { x: { requestId: 'r', expectedVersion: 0, item: { type: 'todo', createdAt: 'original' }, secret: 'must-not-expose' } }, data: { items: [{ id: 'x', type: 'project', createdAt: 'current' }] }, heldLocal: { copy: true } };
  const before = JSON.stringify(snapshot);
  const rows = rejectionDetails(snapshot, 'x');
  assert.equal(rows.find(row => row.label === '原请求预期云端版本').value, '0');
  assert.equal(rows.find(row => row.label === '原请求分类').value, 'todo');
  assert.equal(rows.find(row => row.label === '当前本机分类').value, 'project');
  assert.equal(JSON.stringify(rows).includes('must-not-expose'), false);
  assert.equal(JSON.stringify(snapshot), before);
});

test('关联组成员读取同一原请求，缺失信息不伪造原因', () => {
  const snapshot = { outbox: { first: { requestId: 'batch', entries: [{ id: 'second', expectedVersion: 7, moveFrom: 'note', item: { type: 'todo' } }] } } };
  const rows = rejectionDetails(snapshot, 'second');
  assert.equal(rows.find(row => row.label === '请求 ID').value, 'batch');
  assert.equal(rows.find(row => row.label === '原请求预期云端版本').value, '7');
  assert.equal(rows.find(row => row.label === '错误码').value, '未保存错误码');
  assert.doesNotThrow(() => rejectionDetails(null, 'missing'));
});
