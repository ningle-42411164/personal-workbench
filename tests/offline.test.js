import test from 'node:test';import assert from 'node:assert/strict';import {IDBFactory} from 'fake-indexeddb';
import {createOfflineStore} from '../src/offline/store.js';import {createSyncStore} from '../src/sync/syncStore.js';
import {createSimpleItem,toggleTodo,validateWorkbenchData} from '../src/data/workbenchData.js';import {setReminderDate,activeReminder} from '../src/data/reminders.js';
const data=items=>({schemaVersion:2,items});
test('脱机事务与含云数据库隔离，保存和提醒不生成同步队列',async t=>{
 const indexedDB=new IDBFactory(),offline=createOfflineStore({indexedDB}),cloud=createSyncStore({indexedDB,storage:{getItem:()=>null}});t.after(async()=>{await offline.close();await cloud.close()});
 const c=await cloud.read(),item=setReminderDate(createSimpleItem('waiting','隔离提醒'),'2026-11-20');
 let state=await offline.read();assert.deepEqual(state.data.items,[]);
 state=await offline.save(data([item]),state.revision,{reminderNow:new Date(2026,10,19).toISOString()});assert.equal(activeReminder(state.data.items[0]),true);assert.equal(state.outbox,undefined);assert.deepEqual((await cloud.read()).data,c.data);
 const completed=toggleTodo(state.data.items[0]);state=await offline.save(data([completed]),state.revision);state=await offline.save(data([toggleTodo(completed)]),state.revision);assert.equal(activeReminder(state.data.items[0]),false);
 await assert.rejects(offline.save(data([]),state.revision-1));assert.deepEqual((await offline.read()).data,state.data);
 assert.deepEqual(validateWorkbenchData(JSON.parse(JSON.stringify(state.data))),state.data);
 const peer=createOfflineStore({indexedDB});t.after(()=>peer.close());assert.deepEqual((await peer.read()).data,state.data);
});
