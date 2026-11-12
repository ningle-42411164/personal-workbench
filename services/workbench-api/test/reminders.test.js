import test from 'node:test';
import assert from 'node:assert/strict';
import {D1Store} from '../src/store.js';
import {WorkbenchService,READ_SCOPE,WRITE_SCOPE} from '../src/service.js';
import {sqliteD1} from './sqlite-d1.js';
import {fixtureMcpClient} from './mcp-fixture.js';
import {setReminderDate,applyDueReminders,initialReminderSnapshot} from '../../../src/data/reminders.js';
const setup=t=>{const db=sqliteD1();t.after(()=>db.close());return new WorkbenchService(new D1Store(db,'reminder-test'),{id:'reminder-test',scopes:[READ_SCOPE,WRITE_SCOPE]});};
async function waiting(service){return service.create({requestId:crypto.randomUUID(),type:'waiting',title:'隔离日期提醒'});}
const move=item=>applyDueReminders([setReminderDate(item,'2026-11-20')],new Date(2026,10,19,9))[0];
test('严格提醒转换保留原内容，拒绝任意分类覆盖、伪造属性和过期版本',async t=>{
 const s=setup(t),old=await waiting(s),item=move(old.item);
 const input={requestId:'reminder-valid-move',id:item.id,expectedVersion:1,moveFrom:'waiting',item};
 await assert.rejects(s.sync({...input,requestId:'reminder-forged-title',item:{...item,title:'偷改内容'}}),{code:'INVALID_MOVE'});
 await assert.rejects(s.sync({...input,requestId:'reminder-no-discriminant',moveFrom:undefined}),{code:'IMMUTABLE_FIELD'});
 await assert.rejects(s.sync({...input,requestId:'reminder-bad-structure',item:{...item,reminder:{...item.reminder,extra:true}}}));
 const first=await s.sync(input);assert.deepEqual(await s.sync(input),first);
 await assert.rejects(s.sync({...input,requestId:'reminder-stale-version'}),{code:'VERSION_CONFLICT'});
 const oldClient=await waiting(s);const updated=await s.sync({requestId:'old-client-unaffected',id:oldClient.item.id,expectedVersion:1,item:{...oldClient.item,title:'旧客户端无提醒'}});assert.equal(updated.item.reminder,undefined);
});
test('MCP SDK 读取、修改、完成、恢复和删除的真实协议保留提醒生命周期',async t=>{
 const s=setup(t),old=await waiting(s),item=move(old.item);
 await s.sync({requestId:'mcp-reminder-seed',id:item.id,expectedVersion:1,moveFrom:'waiting',item});
 const client=await fixtureMcpClient(s);t.after(()=>client.close());
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,JSON.stringify(r));return r.structuredContent;};
 let result=await call('get_item',{id:item.id});assert.deepEqual(result.item.reminder,item.reminder);
 result=await call('update_item',{requestId:'mcp-reminder-name',id:item.id,expectedVersion:result.version,fields:{title:'隔离改名',tags:['提醒']}});assert.deepEqual(result.item.reminder,item.reminder);
 result=await call('set_item_completion',{requestId:'mcp-reminder-done',id:item.id,expectedVersion:result.version,done:true});assert.equal(result.item.reminder.state,'stopped');
 result=await call('set_item_completion',{requestId:'mcp-reminder-restore',id:item.id,expectedVersion:result.version,done:false});assert.equal(result.item.reminder.state,'stopped');
 result=await call('delete_item',{requestId:'mcp-reminder-delete',id:item.id,expectedVersion:result.version});assert.equal(result.deleted,true);
});
