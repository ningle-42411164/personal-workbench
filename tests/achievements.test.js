import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {createSyncStore} from '../src/sync/syncStore.js';
import {createOfflineStore} from '../src/offline/store.js';
import {createTodo,createSimpleItem,createProject,toggleTodo,updateProject,createRoutine,createImportantDate} from '../src/data/workbenchData.js';
import {recordLocalAction,emptyAchievements,validateAchievements,parseBackup,exportBackup,localDay} from '../src/data/achievements.js';
import {createCelebrationQueue} from '../src/data/celebrationQueue.js';

const start='2026-11-14T01:00:00.000Z',time=offset=>new Date(Date.parse(start)+offset).toISOString();
const data=items=>({schemaVersion:2,items});
const todo=id=>({...createTodo(id,false,start),id});
function complete(archive,item,at=start,source='ui') {
  const next=item.type==='project'?{...item,status:'done',completedAt:at}:toggleTodo(item,at);
  return recordLocalAction(archive,[item],[next],{source,kind:'complete',id:item.id},at);
}
for(const kind of ['cloud','offline']) {
  function setup(t){const indexedDB=new IDBFactory();const options={indexedDB,storage:{getItem:()=>null},name:kind};const make=()=>kind==='cloud'?createSyncStore(options):createOfflineStore(options);const store=make();t.after(()=>store.close());return {store,make};}
  test(`${kind}: 保存与成就同一事务、失败回滚、重开保留；不发云端成就字段`,async t=>{
    const {store,make}=setup(t);let state=await store.read();const items=Array.from({length:5},(_,i)=>todo('t'+i));
    state=await store.save(data(items),state.revision);assert.equal(state.achievements,undefined);
    for(let i=0;i<4;i++){items[i]=toggleTodo(items[i],time(i*1000));state=await store.save(data(items),state.revision,{localAction:{source:'ui',kind:'complete',id:items[i].id},actionTime:time(i*1000)});assert.deepEqual(state.localEffects.unlocked,[]);}
    const old=await store.read();items[4]=toggleTodo(items[4],time(4000));
    const originalPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(){throw Error('隔离注入：磁盘写入失败');};
    try {await assert.rejects(store.save(data(items),state.revision,{localAction:{source:'ui',kind:'complete',id:'t4'},actionTime:time(4000)}),/隔离注入/);} finally {IDBObjectStore.prototype.put=originalPut;}
    assert.deepEqual(await store.read(),old);
    state=await store.save(data(items),state.revision,{localAction:{source:'ui',kind:'complete',id:'t4'},actionTime:time(4000)});
    assert.deepEqual(state.localEffects.unlocked,['rapid']);assert.equal(state.achievements.unlocked.rapid,time(4000));
    const peer=make();assert.deepEqual((await peer.read()).achievements,state.achievements);await peer.close();
    if(kind==='cloud'){await store.enroll(['t4'],state.revision);await store.setEnabled(true);const job=await store.prepare();assert.equal(JSON.stringify(job).includes('achievements'),false);assert.deepEqual(job.item,items[4]);}
  });
  test(`${kind}: 新备份覆盖、旧备份保留、校验和失败回滚；导入不补发`,async t=>{
    const {store}=setup(t);let state=await store.read();const item={...todo('old'),createdAt:'2026-01-01T00:00:00.000Z'};
    state=await store.save(data([item]),state.revision);state=await store.save(data([toggleTodo(item,start)]),state.revision,{localAction:{source:'ui',kind:'complete',id:item.id},actionTime:start});
    const backup=exportBackup(state.data,state.achievements),savedArchive=structuredClone(state.achievements);
    const oldBackup=parseBackup(data([]));state=await store.save(oldBackup.data,state.revision,{importing:true,importedAchievements:oldBackup.achievements});assert.deepEqual(state.achievements,savedArchive);assert.deepEqual(state.localEffects,{unlocked:[],project:null});
    const malformed=structuredClone(backup);malformed.achievements.version=99;assert.throws(()=>parseBackup(malformed));
    const before=await store.read();await assert.rejects(store.save(backup,state.revision,{importing:true,importedAchievements:malformed.achievements}));assert.deepEqual(await store.read(),before);
    const replacement=emptyAchievements();replacement.unlocked.clean=start;
    const parsed=parseBackup({...data([todo('new')]),achievements:replacement});
    state=await store.save(parsed.data,state.revision,{importing:true,importedAchievements:parsed.achievements,localAction:{source:'ui',kind:'complete',id:'new'}});assert.deepEqual(state.achievements,replacement);assert.deepEqual(state.localEffects,{unlocked:[],project:null});
    if(kind==='cloud'){await store.enroll(['new'],state.revision);const bound=await store.read();await assert.rejects(store.save(data([]),bound.revision,{importing:true,importedAchievements:savedArchive}),/同步记录/);assert.deepEqual(await store.read(),bound);}
  });
  test(`${kind}: 无明确本机来源、读取和导入历史不计；项目反复完成每次一次礼炮`,async t=>{
    const {store}=setup(t);let state=await store.read();const items=Array.from({length:10},(_,i)=>toggleTodo(todo('history'+i),start));
    state=await store.save(data(items),state.revision,{importing:true});assert.equal(state.achievements,undefined);
    let project={...createProject('项目',{status:'active'}),id:'project'};
    state=await store.save(data([...items,project]),state.revision);let celebrations=0;
    for(const status of ['done','active','done','done']){project=updateProject(project,{status},start);state=await store.save(data([...items,project]),state.revision,{localAction:{source:'ui',kind:'complete',id:'project'},actionTime:start});if(state.localEffects.project)celebrations++;}
    assert.equal(celebrations,2);assert.deepEqual(state.achievements.day.ids,['project']);assert.equal(state.achievements.unlocked.daily,undefined);
    assert.equal((await store.read()).localEffects,undefined);
  });
}

test('60秒滚动完成：恰好边界、超时、不足、不同ID及恢复后再次完成',()=>{
  for(const end of [59999,60000,60001]){let archive;for(let i=0;i<5;i++)archive=complete(archive,todo('t'+i),time(i===4?end:i)).archive;assert.equal(Boolean(archive.unlocked.rapid),end<=60000);}
  let archive;for(let i=0;i<7;i++)archive=complete(archive,todo('same'),time(i)).archive;assert.equal(archive.completionWindow.length,1);assert.equal(archive.unlocked.rapid,undefined);
  const before=structuredClone(archive);const result=complete(archive,todo('remote'),start,'sync');assert.deepEqual(result.archive,before);assert.deepEqual(result.effects.unlocked,[]);
});
test('删除10条：已完成与未完成均计、失败/取消无调用、重复和超时不计',()=>{
  for(const end of [60000,60001]){let archive;for(let i=0;i<10;i++){let item=todo('d'+i);if(i%2)item=toggleTodo(item,start);archive=recordLocalAction(archive,[item],[],{source:'ui',kind:'delete',id:item.id},time(i===9?end:i)).archive;}assert.equal(Boolean(archive.unlocked.clean),end===60000);}
  let archive;for(let i=0;i<12;i++)archive=recordLocalAction(archive,[todo('same')],[],{source:'ui',kind:'delete',id:'same'},time(i)).archive;assert.equal(archive.deletionWindow.length,1);
  assert.equal(recordLocalAction(undefined,[todo('cancel')],[todo('cancel')],{source:'ui',kind:'delete',id:'cancel'}).archive,undefined);
});
test('30天边界与旧创建时间；同操作可解锁多项、首次时间不变',()=>{
  for(const age of [30*86400000-1,30*86400000]){const item={...todo('aged'),createdAt:time(-age),title:'后来改名',tags:['后来加标签']};assert.equal(Boolean(complete(undefined,item).archive.unlocked.old),age===30*86400000);}
  let archive;for(let i=0;i<4;i++)archive=complete(archive,todo('r'+i),time(i)).archive;
  archive.day.ids.push(...['other1','other2','other3','other4','other5']);
  const old={...todo('fifth'),createdAt:'2026-01-01T00:00:00.000Z'};const result=complete(archive,old,time(10));assert.deepEqual(result.effects.unlocked,['daily','rapid','old']);
  const again=complete(result.archive,old,time(20));assert.deepEqual(again.effects.unlocked,[]);assert.deepEqual(again.archive.unlocked,result.archive.unlocked);
});
test('本地换日、同ID当天一次、其他事项和项目计数，日常及重要日排除',()=>{
  const local=new Date(2026,10,14,23,59,59).toISOString(),next=new Date(2026,10,15,0,0,0).toISOString();let archive;
  for(let i=0;i<9;i++)archive=complete(archive,{...createSimpleItem('shopping','购物'),id:'s'+i},local).archive;
  archive=complete(archive,todo('last'),next).archive;assert.equal(archive.day.ids.length,1);assert.equal(archive.unlocked.daily,undefined);assert.equal(archive.day.date,localDay(next));
  archive=complete(archive,todo('last'),next).archive;assert.equal(archive.day.ids.length,1);
  for(let i=0;i<8;i++)archive=complete(archive,{...createSimpleItem('waiting','等待'),id:'w'+i},next).archive;
  const before=structuredClone(archive);for(const item of [createRoutine('日常'),createImportantDate('日期','2026-12-01')])archive=recordLocalAction(archive,[item],[{...item,done:true}],{source:'ui',kind:'complete',id:item.id},next).archive;assert.deepEqual(archive,before);
  archive=complete(archive,createProject('项目',{status:'active'}),next).archive;assert.ok(archive.unlocked.daily);
});
test('排序只计主动目标10个、重复/被动/置顶不计；切类、退出重进和刷新不能续轮',()=>{
  let archive;const move=(id,session='one',category='todo')=>{const old=todo(id);return recordLocalAction(archive,[old],[{...old,rank:1}],{source:'ui',kind:'move',id,session,category},start).archive;};
  for(let i=0;i<9;i++)archive=move('m'+i);for(let i=0;i<5;i++)archive=move('m0');assert.equal(archive.sorting.ids.length,9);assert.equal(archive.unlocked.order,undefined);
  const old=todo('pin');assert.deepEqual(recordLocalAction(archive,[old],[{...old,pinned:true,rank:2}],{source:'ui',kind:'move',id:'pin',session:'one',category:'todo'},start).archive,archive);
  archive=move('new','two');assert.deepEqual(archive.sorting.ids,['new']);for(let i=0;i<9;i++)archive=move('n'+i,'two');assert.ok(archive.unlocked.order);
  const fresh=move('fresh','new-window');assert.equal(fresh.sorting.ids.length,1);
});
test('存档校验拒绝伪造类型、未知成就和重复ID；导出不修改源',()=>{
  for(const change of [a=>a.unlocked.unknown=start,a=>a.day.ids=['a','a'],a=>a.completionWindow=[{id:'a',at:'bad'}]]){const archive=emptyAchievements();change(archive);assert.throws(()=>validateAchievements(archive));}
  const archive=emptyAchievements(),backup=exportBackup(data([]),archive);backup.achievements.unlocked.clean=start;assert.deepEqual(archive.unlocked,{});
});
test('云端拉取/MCP结果回流不计数、不发奖、不改变既有首次解锁时间',async t=>{
  const store=createSyncStore({indexedDB:new IDBFactory(),storage:{getItem:()=>null}});t.after(()=>store.close());
  let state=await store.read();const archive=emptyAchievements();archive.unlocked.old=start;
  state=await store.save(data([]),state.revision,{importing:true,importedAchievements:archive});await store.setEnabled(true);
  const items=Array.from({length:10},(_,i)=>toggleTodo(todo('remote'+i),start));items.push({...createProject('远端项目',{status:'done'}),id:'remote-project'});
  await store.applyChanges({changes:items.map(item=>({id:item.id,record:{item,version:1},deleted:false})),cursor:'1',until:'1',hasMore:false},'0');
  state=await store.read();assert.equal(state.data.items.length,11);assert.deepEqual(state.achievements,archive);assert.equal(state.localEffects,undefined);
});
test('提醒逐项完整5秒、手动关闭推进、回放不写存档；礼炮队列3.4秒',()=>{
  let now=0,seq=0;const timers=new Map(),shown=[],hidden=[];
  const schedule=(fn,delay)=>{timers.set(++seq,{fn,at:now+delay});return seq;},cancel=id=>timers.delete(id);
  const tick=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
  const queue=createCelebrationQueue({show:id=>shown.push([id,now]),hide:()=>hidden.push(now),schedule,cancel});
  queue.push('rapid');queue.push('old');tick(4999);assert.deepEqual(shown,[['rapid',0]]);tick(1);assert.deepEqual(shown,[['rapid',0],['old',5000]]);tick(4999);assert.equal(queue.current,'old');tick(1);assert.equal(queue.current,null);
  queue.push('rapid');queue.push('daily');queue.dismiss();assert.equal(queue.current,'daily');queue.dispose();assert.equal(timers.size,0);
  const project=createCelebrationQueue({duration:3400,show:()=>{},hide:()=>{},schedule,cancel});project.push('p');tick(3399);assert.equal(project.current,'p');tick(1);assert.equal(project.current,null);
});
