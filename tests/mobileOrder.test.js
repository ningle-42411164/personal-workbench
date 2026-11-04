import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRows, subgroup, moveRank, returnTodo } from '../src/data/itemOrder.js';
import { createNote, createProject, convertNote, validateWorkbenchData } from '../src/data/workbenchData.js';
import { syncSchema, syncItem, patchProject } from '../services/workbench-api/src/domain.js';
test('项目状态和置顶分组独立，拖动跨组失败且不会生成历史',()=>{
 const items=[['paused',false],['active',false],['paused',true],[null,true]].map(([status,pinned])=>({...createProject('夹具',{status}),pinned}));
 assert.deepEqual(items.sort(compareRows).map(subgroup),[0,1,2,3]);
 assert.equal(moveRank(items,0,3),null);
 const old=items[0], next=patchProject(old,{nextStep:'新步骤'});
 assert.equal(next.pinned,true);assert.ok(Number.isFinite(next.rank));assert.deepEqual(next.updates,old.updates);
 assert.equal(patchProject(next,{nextStep:'新步骤'}),next);
});
test('同一毫秒的相邻旧事项中间插入只改被拖动项',()=>{
 const rows=['a','b','c'].map(id=>({...createNote(id,'2026-01-01T00:00:00.000Z'),id})).sort(compareRows);
 const moved={...rows[2],...moveRank(rows,2,1)};
 assert.deepEqual([rows[0],rows[1],moved].sort(compareRows).map(x=>x.id),['a','c','b']);
});
test('退回已关联待办，同 ID 保留来源和标签，可导出及双端校验',()=>{
 const source=createNote('来源'), old=convertNote([source],source.id,'todo');
 const target=old.find(x=>x.type==='todo');target.tags=['工作'];target.urgent=true;
 const result=returnTodo(old,target.id), note=result.find(x=>x.id===target.id);
 assert.equal(note.type,'note');assert.equal(note.createdAt,target.createdAt);assert.equal(note.urgent,undefined);assert.deepEqual(note.tags,['工作']);
 assert.deepEqual(result.find(x=>x.id===source.id),old.find(x=>x.id===source.id));
 validateWorkbenchData(JSON.parse(JSON.stringify({schemaVersion:2,items:result})));
 const input=syncSchema.parse({id:note.id,expectedVersion:1,requestId:'isolated-return',item:note});assert.deepEqual(syncItem(input,target,result),note);
 assert.throws(()=>syncItem(input,{...target,done:true},result));assert.throws(()=>returnTodo([{...target,done:true}],target.id));
});
