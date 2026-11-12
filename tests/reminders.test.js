import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createSyncStore} from '../src/sync/syncStore.js';
import {createSyncEngine} from '../src/sync/syncEngine.js';
import {createSyncApi} from '../src/sync/syncApi.js';
import {WorkbenchService,READ_SCOPE,WRITE_SCOPE} from '../services/workbench-api/src/service.js';
import {D1Store} from '../services/workbench-api/src/store.js';
import {sqliteD1} from '../services/workbench-api/test/sqlite-d1.js';
import {handleApi} from '../services/workbench-api/src/http.js';
import {createSimpleItem,createTodo,createNote,convertNote,toggleTodo,renameItem,validateWorkbenchData} from '../src/data/workbenchData.js';
import {returnTodo,compareRows} from '../src/data/itemOrder.js';
import {setReminderDate,applyDueReminders,activeReminder,createReminderQueue,initialReminderSnapshot} from '../src/data/reminders.js';
const data=items=>({schemaVersion:2,items}), at='2026-11-12T01:00:00.000Z';
const day=n=>new Date(2026,10,n,9), waiting=()=>createSimpleItem('waiting','隔离提醒',at);
function memoryStorage(value = null) { let raw = value; return { getItem: () => raw, setItem: (_key, value) => { raw = value; } }; }
function setup(t, items = []) {
  const indexedDB = new IDBFactory(), storage = memoryStorage(JSON.stringify(data(items)));
  const store = createSyncStore({ indexedDB, storage, ownerPhone: true });
  const db = sqliteD1();
  const service = new WorkbenchService(new D1Store(db, 'fictional-owner'), { id: 'fictional-owner', scopes: [READ_SCOPE, WRITE_SCOPE] });
  const controls = { online: true, workerFailure: null, loseReply: false, corruptReply: false, denied: false, calls: [], statuses: [] };
  const api = createSyncApi({ issuer: 'https://sync.test', auth: { getAccessToken: async () => 'fake-local-test-access', getStatus: () => ({ canWrite: !controls.denied }) },
    async fetcher(url, init) {
      controls.calls.push({ path: url.pathname, method: init.method, body: init.body });
      if (!controls.online) throw new TypeError('fictional network unavailable');
      if (controls.workerFailure === 'network') throw new TypeError('fictional Worker unreachable while online');
      if (controls.workerFailure === '503') return Response.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
      const response = await handleApi(new Request(url, init), service, 'https://sync.test');
      if (controls.loseReply && init.method === 'PUT') { controls.loseReply = false; throw new TypeError('fictional reply lost after commit'); }
      if (controls.corruptReply && init.method === 'PUT') { controls.corruptReply = false; const value = await response.json(); return Response.json({ ...value, item: { ...value.item, title: '错误回执内容' } }); }
      return response;
    },
  });
  const engine = createSyncEngine({ store, api, isOnline: () => controls.online, onStatus: value => controls.statuses.push(value), schedule: () => 1, cancel: () => {} });
  t.after(async () => { engine.stop(); await store.close(); db.close(); });
  return { indexedDB, storage, store, service, api, engine, controls };
}
async function add(store, item) { const state = await store.read(); return store.save(data([...state.data.items, item]), state.revision); }
async function change(store, id, operation) { const state = await store.read(); return store.save(data(state.data.items.map(item => item.id === id ? operation(item) : item)), state.revision); }

test('自然日前两天不转、前一天同 ID 一次转换，来源与原属性保留',()=>{
 const old=waiting();assert.deepEqual(applyDueReminders([old],day(20)),[old]);
 const item=setReminderDate({...old,pinned:true,favorite:true,tags:['标签']},'2026-11-20',at);
 assert.equal(applyDueReminders([item],day(18))[0],item);
 const [moved]=applyDueReminders([item],day(19));assert.equal(moved.type,'todo');assert.equal(moved.id,item.id);
 for(const key of ['pinned','favorite','tags','createdAt','title'])assert.deepEqual(moved[key],item[key]);
 assert.equal(moved.urgent,false);assert.deepEqual(applyDueReminders([moved],day(22)),[moved]);
});

test('旧双记录关联原时间保留、导出导入往返和字段拒绝',()=>{
 const note=createNote('旧来源',at), linked=convertNote([note],note.id,'waiting');
 const edited=linked.map(x=>x.type==='waiting'?setReminderDate(x,'2026-11-20',at):x);
 const moved=applyDueReminders(edited,day(19));
 const source=moved.find(x=>x.id===note.id);assert.equal(source.convertedToType,'todo');assert.equal(source.convertedAt,linked[0].convertedAt);
 assert.deepEqual(validateWorkbenchData(JSON.parse(JSON.stringify(data(moved)))),data(moved));
 assert.throws(()=>validateWorkbenchData(data([{...moved[1],reminder:{...moved[1].reminder,date:'2026-02-30'}}])));
 assert.throws(()=>setReminderDate(createTodo('普通',false,at),'2026-11-20'));
});

test('改远日期不退回；两种取消、完成恢复和退回随笔不重启',()=>{
 const item=setReminderDate(waiting(),'2026-11-20',at), moved=applyDueReminders([item],day(19))[0];
 const far=setReminderDate(moved,'2027-12-01');assert.equal(activeReminder(far),true);assert.equal(far.reminder.enteredAt,moved.reminder.enteredAt);
 for(const value of [item,moved]){const canceled=setReminderDate(value,'');assert.equal(canceled.type,value.type);assert.equal(canceled.reminder.date,null);assert.equal(activeReminder(canceled),false);}
 const done=toggleTodo(moved), restored=toggleTodo(done);assert.equal(activeReminder(done),false);assert.equal(activeReminder(restored),false);assert.equal(restored.type,'todo');
 assert.deepEqual(applyDueReminders([restored],day(30)),[restored]);
 const note=returnTodo([moved],moved.id)[0];assert.equal(note.reminder.date,null);assert.equal(note.reminder.state,'stopped');validateWorkbenchData(data([note]));
});

test('提醒先于紧急、置顶和普通，首次入队排序不受 rank 影响',()=>{
 const a=applyDueReminders([setReminderDate(waiting(),'2026-11-20')],day(19))[0],b=applyDueReminders([setReminderDate(waiting(),'2026-11-20')],day(20))[0];
 a.rank=999;b.rank=-999;
 const urgent=createTodo('急',true,at),pin={...createTodo('置顶',false,at),pinned:true},plain=createTodo('普通',false,at);
 assert.deepEqual([plain,b,pin,urgent,a].sort(compareRows).map(x=>x.id),[a,b,urgent,pin,plain].map(x=>x.id));
});

test('逐条实际显示才开始 CD，确认不改时间、59/60 分钟与刷新持久化',()=>{
 const items=[waiting(),waiting()].map((x,i)=>applyDueReminders([setReminderDate(x,'2026-11-20')],day(19+i))[0]);
 let time=0,raw=null;const storage={getItem:()=>raw,setItem:(_k,v)=>raw=v},queue=createReminderQueue({storage,now:()=>time});
 assert.equal(queue.open(items).id,items[0].id);assert.equal(Object.keys(JSON.parse(raw)).length,1);
 time=600000;assert.equal(queue.acknowledge(items).id,items[1].id);assert.equal(Object.values(JSON.parse(raw))[0],0);
 assert.equal(queue.acknowledge(items),null);time=3540000;
 const reloaded=createReminderQueue({storage,now:()=>time});assert.equal(reloaded.open(items),null);
 time=3600000;assert.equal(reloaded.open(items).id,items[0].id);assert.equal(reloaded.acknowledge(items),null);
 time=4200000;assert.equal(reloaded.open(items).id,items[1].id);
 assert.equal(reloaded.reconcile([]),null);
});

test('本机事务到期转换与脏队列原子提交，旧请求结果不明先重试，再补传',async t=>{
 const s=setup(t);await s.store.read();await s.store.setEnabled(true);const item=waiting();await add(s.store,item);
 const old=await s.store.prepare(),receipt=await s.api.send(old); // 模拟响应丢失
 let state=await s.store.read();await s.store.save(data([setReminderDate(item,'2026-11-20')]),state.revision,{reminderNow:day(19).toISOString()});
 assert.deepEqual(await s.store.prepare(),old);
 await s.store.acknowledge(old,await s.api.send(old));assert.equal(receipt.version,1);
 await s.engine.run();state=await s.store.read();assert.equal(Object.keys(state.dirty).length,0);
 const remote=await s.service.getItem({id:item.id});assert.equal(remote.item.type,'todo');assert.equal(activeReminder(remote.item),true);
 assert.equal(state.data.items.length,1);assert.deepEqual(state.data.items[0],remote.item);
});

test('离线关联组转入、再改名与退回后，联网按合法中间步骤补传',async t=>{
 const s=setup(t);await s.store.read();await s.store.setEnabled(true);
 const note=await s.service.create({requestId:'legacy-reminder-note',type:'note',title:'隔离来源'});
 const converted=await s.service.convertNote({requestId:'legacy-reminder-link',id:note.item.id,expectedVersion:1,targetType:'waiting'});
 await s.engine.run();let state=await s.store.read();const target=state.data.items.find(x=>x.type==='waiting');
 await s.store.save(data(state.data.items.map(x=>x.id===target.id?setReminderDate(x,'2026-11-20'):x)),state.revision,{reminderNow:day(19).toISOString()});
 state=await s.store.read();await s.store.save(data(returnTodo(state.data.items,target.id).map(x=>x.id===target.id?renameItem(x,'退回新名称'):x)),state.revision);
 await s.engine.run();state=await s.store.read();assert.deepEqual(state.blocked,{});assert.deepEqual(state.dirty,{});
 const remote=await s.service.getItem({id:target.id});assert.equal(remote.item.type,'note');assert.equal(remote.item.title,'退回新名称');assert.equal(remote.item.reminder.date,null);
 const source=await s.service.getItem({id:note.item.id});assert.equal(source.item.convertedToType,'todo');assert.equal(source.item.convertedAt,converted.records[0].item.convertedAt);
});

test('保存失败与编辑排除不转入，恢复保存后立即检查',async t=>{
 const s=setup(t);const item=setReminderDate(waiting(),'2026-11-20');await s.store.read();await add(s.store,item);
 await s.store.checkReminders(day(19).toISOString(),[item.id]);let state=await s.store.read();assert.equal(state.data.items[0].type,'waiting');
 await assert.rejects(s.store.save(data([]),state.revision-1));assert.deepEqual((await s.store.read()).data,state.data);
 await s.store.checkReminders(day(19).toISOString());assert.equal((await s.store.read()).data.items[0].type,'todo');
});

test('MCP 共用完成/恢复/改名/标签路径保留提醒并停止，云端回流不复活',async t=>{
 const s=setup(t);await s.store.read();await s.store.setEnabled(true);const item=applyDueReminders([setReminderDate(waiting(),'2026-11-20')],day(19))[0];await add(s.store,item);await s.engine.run();
 let remote=await s.service.getItem({id:item.id});remote=await s.service.patchItem({requestId:'reminder-patch-mcp',id:item.id,expectedVersion:remote.version,fields:{title:'MCP改名',tags:['保留']}});
 assert.deepEqual(remote.item.reminder,item.reminder);
 remote=await s.service.completeItem({requestId:'reminder-complete-mcp',id:item.id,expectedVersion:remote.version,done:true});assert.equal(remote.item.reminder.state,'stopped');
 remote=await s.service.completeItem({requestId:'reminder-restore-mcp',id:item.id,expectedVersion:remote.version,done:false});await s.engine.run();assert.equal(activeReminder((await s.store.read()).data.items[0]),false);
 await s.service.deleteItem({requestId:'reminder-delete-mcp',id:item.id,expectedVersion:remote.version});await s.engine.run();assert.equal((await s.store.read()).data.items.length,0);
});

for(const choice of ['local','cloud'])test('提醒关联组冲突采用'+choice+'保留双方并完成同步',async t=>{
 const s=setup(t);await s.store.read();await s.store.setEnabled(true);
 const source=await s.service.create({requestId:'conflict-source-note',type:'note',title:'来源'});
 await s.service.convertNote({requestId:'conflict-source-convert',id:source.item.id,expectedVersion:1,targetType:'waiting'});await s.engine.run();
 let state=await s.store.read();const item=state.data.items.find(x=>x.type==='waiting');
 await s.store.save(data(state.data.items.map(x=>x.id===item.id?setReminderDate(x,'2026-11-20'):x)),state.revision,{reminderNow:day(19).toISOString()});
 const remote=await s.service.getItem({id:item.id});await s.service.patchItem({requestId:'cloud-edit-before-reminder',id:item.id,expectedVersion:remote.version,fields:{title:'云端改名'}});
 await s.engine.run();state=await s.store.read();assert.ok(state.blocked[item.id]);
 if(choice==='local')await s.store.resolveWithLocal(item.id,state.revision,state.blocked[item.id]);else await s.store.resolveWithCopy(item.id,state.revision,state.blocked[item.id]);
 await s.engine.run();state=await s.store.read();assert.deepEqual(state.blocked,{});assert.deepEqual(state.dirty,{});
 assert.equal((await s.service.getItem({id:item.id})).item.type,choice==='local'?'todo':'waiting');
 if(choice==='cloud')assert.ok(state.data.items.some(x=>x.title.includes('冲突副本')&&activeReminder(x)));
});
