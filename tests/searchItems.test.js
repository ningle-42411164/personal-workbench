import test from 'node:test';
import assert from 'node:assert/strict';
import { searchItems, isCompletedItem, itemStateLabel } from '../src/data/searchItems.js';
import { isKnownTestRecord, KNOWN_TEST_IDS } from '../src/sync/knownTestRecords.js';

test('全量搜索名称/标签，同名按 ID 保留，暂停与完成均可查询，查询不修改数据', () => {
  const items = [{ id:'a',type:'todo',title:'同名',tags:['学习'],done:false }, {id:'b',type:'project',title:'同名',tags:[],status:'paused'},
    {id:'c',type:'project',title:'已完成',tags:['学习'],status:'done'}, {id:'d',type:'routine',title:'日常',tags:['学习']},
    {id:'e',type:'importantDate',title:'日期',tags:['学习']}, {id:'f',type:'note',title:'随笔',tags:[],done:true}];
  const before=JSON.stringify(items);
  assert.deepEqual(searchItems(items,'同名').map(x=>x.id),['a','b']);
  assert.deepEqual(searchItems(items,'学习').map(x=>x.id),['a','c','d','e']);
  assert.deepEqual(searchItems(items,'学习',true).map(x=>x.id),['c']);
  assert.equal(itemStateLabel(items[1]),'暂停中');
  assert.equal(itemStateLabel(items[3]),''); assert.equal(isCompletedItem(items[4]),false);
  assert.deepEqual(searchItems(items,'  '),[]);assert.equal(JSON.stringify(items),before);
});

test('隔离测试记录不进入搜索', () => {
  const id=KNOWN_TEST_IDS[0];
  assert.equal(isKnownTestRecord(id),true);
  assert.deepEqual(searchItems([{id,title:'隔离记录',tags:[],type:'todo'}],'隔离'),[]);
});
