import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, createProject, createSimpleItem, createNote, toggleTodo, updateProject, validateWorkbenchData, writeWorkbenchData, readWorkbenchData } from '../src/data/workbenchData.js';
import { sortedCompleted, completedBatchLimit, toggleFavorite } from '../src/data/completedItems.js';
import { syncSchema, syncItem, patchProject, patchItem } from '../services/workbench-api/src/domain.js';

const time = '2026-11-11T12:00:00.000Z';
test('收藏兼容旧备份，失败不修改原值，刷新/恢复/再次完成保留，项目不追加历史', () => {
  for (const item of [toggleTodo(createTodo('待办',false,time),time), updateProject(createProject('项目',{},time),{status:'done'},time), ...['note','waiting','shopping','creation'].map(type=>toggleTodo(type==='note'?createNote('随笔',time):createSimpleItem(type,'事项',time),time))]) {
    const old=structuredClone(item);validateWorkbenchData({schemaVersion:2,items:[item]});assert.equal(item.favorite,undefined);
    const next=toggleFavorite(item,time);assert.equal(next.favorite,true);assert.deepEqual(item,old);
    assert.throws(()=>writeWorkbenchData({schemaVersion:2,items:[next]},{setItem(){throw Error('disk full');}}),/disk full/);
    assert.deepEqual(item,old);
    let raw;writeWorkbenchData({schemaVersion:2,items:[next]},{setItem(k,v){raw=v;}});
    const restored=readWorkbenchData({getItem(){return raw;}}).items[0];assert.deepEqual(restored,next);
    const undone=item.type==='project'?updateProject(restored,{status:'active'},time):toggleTodo(restored,time);
    assert.equal(undone.favorite,true);assert.equal(sortedCompleted([undone]).length,0);
    const done=item.type==='project'?updateProject(undone,{status:'done'},time):toggleTodo(undone,time);
    assert.equal(done.favorite,true);assert.deepEqual(done.updates,item.updates);
    assert.equal(toggleFavorite(done,time).favorite,false);
    const input={requestId:'favorite-test-request',id:next.id,expectedVersion:1,item:next};
    assert.deepEqual(syncItem(syncSchema.parse(input),item),next);
    assert.equal(patchItem(next,{title:'新名称'}).favorite,true);
    if(item.type==='project')assert.equal(patchProject(next,{nextStep:'推进'}).favorite,true);
    assert.throws(()=>validateWorkbenchData({schemaVersion:2,items:[{...item,favorite:'yes'}]}),/收藏/);
    assert.equal(syncSchema.safeParse({...input,item:{...next,favorite:'yes'}}).success,false);
  }
});
test('收藏混排先于分批：普通事项与项目共享额度，两个定位入口按 ID 找排序后的批次', () => {
  const records=Array.from({length:24},(_,i)=>{
    const timestamp=new Date(Date.parse(time)+i*1000).toISOString();
    const item=i%2?updateProject(createProject(`项目${i}`,{},time),{status:'done'},timestamp):toggleTodo(createTodo(`待办${i}`,false,time),timestamp);
    return {...item,...(i<3?{favorite:true}:{})};
  });
  const before=structuredClone(records),sorted=sortedCompleted(records);
  assert.deepEqual(records,before);assert.deepEqual(sorted.slice(0,3).map(x=>x.id),[records[2],records[1],records[0]].map(x=>x.id));
  assert.deepEqual(sorted.slice(3).map(x=>x.id),records.slice(3).reverse().map(x=>x.id));
  assert.equal(sorted.slice(0,10).length,10);assert.ok(sorted.slice(0,10).some(x=>x.type==='project'));
  assert.equal(completedBatchLimit(sorted,sorted[9].id),10);
  assert.equal(completedBatchLimit(sorted,sorted[10].id),20);
  assert.equal(completedBatchLimit(sorted,sorted[20].id),30);
  assert.equal(completedBatchLimit(sorted,'missing'),10);
});
