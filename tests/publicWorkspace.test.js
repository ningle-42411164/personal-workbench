import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createPublicWorkspace} from '../src/public/workspace.js';
import {publicStore,associateAnonymous} from '../src/public/store.js';
import {publicConfig} from '../src/public/config.js';
import {createPublicIdentity} from '../src/public/identity.js';
import {createTodo,createSimpleItem,renameItem,toggleTodo} from '../src/data/workbenchData.js';
import {setReminderDate,createReminderQueue} from '../src/data/reminders.js';
import {WorkbenchService,READ_SCOPE,WRITE_SCOPE} from '../services/workbench-api/src/service.js';
import {D1Store} from '../services/workbench-api/src/store.js';
import {sqliteD1} from '../services/workbench-api/test/sqlite-d1.js';
import {handleApi} from '../services/workbench-api/src/http.js';
const at='2026-11-18T12:00:00.000Z',data=items=>({schemaVersion:2,items});
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const config={ready:true,apiUrl:'https://public.test',mcpUrl:'https://public.test/mcp',publishableKey:'pk_test_aW5zdGFuY2UuY2xlcmsuYWNjb3VudHMuZGV2JA=='};
function fixture(t){
  const indexedDB=new IDBFactory(),storage=memory(),db=sqliteD1(),database='public-isolated-'+crypto.randomUUID();
  const services=Object.fromEntries(['A','B'].map(x=>['user_'+x,new WorkbenchService(new D1Store(db,'user_'+x),{id:'user_'+x,scopes:[READ_SCOPE,WRITE_SCOPE]})]));
  const control={user:'A',logins:0,online:true,calls:[],beforeFetch:null,grants:[{id:'fixture-grant',clientName:'Isolated standard AI',scope:'workbench:read'}]};
  const identity={async authenticate(){control.logins++;const id='user_'+control.user;return {id,email:control.user.toLowerCase()+'@example.invalid',async getToken(){if(id!=='user_'+control.user)throw Error('changed session');return id;}};},async signOut(){},cancel(){}};
  const fetcher=async(input,init={})=>{const url=new URL(input);const token=new Headers(init.headers).get('Authorization')?.slice(7);control.calls.push({id:token,path:url.pathname,method:init.method??'GET',body:init.body});if(control.beforeFetch)await control.beforeFetch(url,init);if(!control.online)throw TypeError('isolated offline');
    if(!services[token])return Response.json({code:'UNAUTHORIZED'},{status:401});
    if(url.pathname==='/api/grants')return Response.json({items:control.grants});
    if(url.pathname.startsWith('/api/grants/')&&init.method==='DELETE'){control.grants=[];return new Response(null,{status:204});}
    return handleApi(new Request(url,init),services[token],config.apiUrl);
  };
  const options={indexedDB,storage,database,config,identity,fetcher,engineOptions:{schedule:()=>1,cancel:()=>{}}};
  const workspace=createPublicWorkspace(options);t.after(async()=>{await workspace.close();db.close();});
  return {workspace,indexedDB,storage,database,services,control,options};
}
async function add(workspace,item){const snapshot=workspace.getSnapshot();return workspace.save(data([...snapshot.data.items,item]),snapshot.revision);}
async function edit(workspace,id,fn){const snapshot=workspace.getSnapshot();return workspace.save(data(snapshot.data.items.map(item=>item.id===id?fn(item):item)),snapshot.revision);}
async function cached(s,id){const store=publicStore({indexedDB:s.indexedDB,name:s.database,id});try{return await store.read();}finally{await store.close();}}

test('公开配置没有私人回退；无配置初始化、保存、完成及重开不加载身份或请求云端',async t=>{
  assert.equal(publicConfig({}).ready,false);assert.equal(publicConfig({}).apiUrl,'');
  assert.equal(publicConfig({VITE_PUBLIC_API_URL:'https://personal-workbench-api-test.example.workers.dev',VITE_PUBLIC_CLERK_PUBLISHABLE_KEY:config.publishableKey}).ready,false);
  assert.equal(publicConfig({VITE_PUBLIC_API_URL:config.apiUrl,VITE_PUBLIC_CLERK_PUBLISHABLE_KEY:config.publishableKey}).ready,true);
  const s=fixture(t),workspace=createPublicWorkspace({...s.options,config:publicConfig({})});t.after(()=>workspace.close());
  await workspace.initialize();const todo=createTodo('匿名独立临时事项',false,at);await add(workspace,todo);await edit(workspace,todo.id,item=>toggleTodo(renameItem(item,'修改后保留'),at));
  await workspace.close();await workspace.initialize();assert.equal(workspace.getSnapshot().data.items[0].title,'修改后保留');assert.equal(workspace.getSnapshot().data.items[0].done,true);
  await assert.rejects(workspace.requestSync(),/云功能暂不可用/);assert.equal(s.control.logins,0);assert.equal(s.control.calls.length,0);assert.deepEqual(workspace.getSnapshot().bindings,{});
});

test('匿名关联先显示目标邮箱与数量；取消保留可编辑，过期确认在事务中回滚',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();const todo=createTodo('等待确认的本机事项',false,at);await add(w,todo);
  assert.equal(await w.requestSync(),false);assert.equal(w.getState().pending.email,'a@example.invalid');assert.equal(w.getState().pending.count,1);assert.equal(s.control.calls.length,0);
  w.cancelAssociation();await edit(w,todo.id,item=>renameItem(item,'取消后仍可编辑'));assert.equal((await cached(s,'user_A')).data.items.length,0);
  await w.requestSync();await add(w,createTodo('登录期间另一个有效本机保存',false,at));await assert.rejects(w.confirmAssociation(),/登录期间已变化/);
  assert.equal((await cached(s)).data.items.length,2);assert.equal((await cached(s,'user_A')).data.items.length,0);assert.equal(s.control.calls.length,0);
  await w.requestSync();await w.confirmAssociation();assert.equal(w.getSnapshot().publicAccountKey,'account:user_A');assert.equal((await cached(s)).data.items.length,0);
  await w.runNow();assert.equal((await s.services.user_A.list({})).items.length,2);assert.deepEqual(w.getSnapshot().dirty,{});
});

test('账号关联遇到缓存同 ID 不同内容保留双方，不部分移动或开启上传',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();const todo=createTodo('匿名原文',false,at);await add(w,todo);
  const account=publicStore({indexedDB:s.indexedDB,name:s.database,id:'user_A'});const initial=await account.read();await account.save(data([renameItem(todo,'缓存原文')]),initial.revision);await account.close();
  await w.requestSync();await assert.rejects(w.confirmAssociation(),/双方均保留/);
  assert.equal((await cached(s)).data.items[0].title,'匿名原文');const target=await cached(s,'user_A');assert.equal(target.data.items[0].title,'缓存原文');assert.equal(target.enabled,false);assert.deepEqual(target.dirty,{});
});

test('A 的待上传请求和偏好不进入 B；切回 A 使用原 requestId 补传，重开不自动连接',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();await w.requestSync();const todo=createTodo('A 独立事项',false,at);await add(w,todo);await w.runNow();
  w.preferenceStorage().setItem('cooldown','A-cooldown');s.control.online=false;await edit(w,todo.id,item=>renameItem(item,'A 待上传'));await w.runNow();const original=(await cached(s,'user_A')).outbox[todo.id];assert.ok(original);
  s.control.user='B';s.control.online=true;await w.requestSync();assert.equal(w.getSnapshot().data.items.length,0);assert.equal(w.preferenceStorage().getItem('cooldown'),null);await w.runNow();assert.equal((await s.services.user_B.list({})).items.length,0);assert.deepEqual((await cached(s,'user_A')).outbox[todo.id],original);
  assert.equal(s.control.calls.some(call=>call.id==='user_B'&&call.body?.includes(todo.id)),false);
  await w.logout();assert.equal(w.getSnapshot().publicAccountKey,'anonymous');assert.equal(w.getSnapshot().data.items.length,0);
  s.control.user='A';await w.requestSync();assert.equal(w.preferenceStorage().getItem('cooldown'),'A-cooldown');await w.runNow();assert.equal((await s.services.user_A.getItem({id:todo.id})).item.title,'A 待上传');
  const writes=s.control.calls.filter(call=>call.method==='PUT'&&call.body?.includes('A 待上传'));assert.equal(JSON.parse(writes[0].body).requestId,JSON.parse(writes.at(-1).body).requestId);
  const calls=s.control.calls.length,logins=s.control.logins;await w.close();await w.initialize();assert.equal(w.getSnapshot().data.items[0].title,'A 待上传');await w.runNow();assert.equal(s.control.calls.length,calls);assert.equal(s.control.logins,logins);
});

test('A 的迟到响应在切到 B 后不会确认队列、替换视图或污染 B',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();await w.requestSync();const todo=createTodo('隔离迟到写入',false,at);await add(w,todo);
  let release,entered;const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  s.control.beforeFetch=async(url,init)=>{if(init.method==='PUT'){entered();await waiting;}};
  const running=w.runNow();await started;const queued=(await cached(s,'user_A')).outbox[todo.id];
  s.control.user='B';await w.requestSync();release();await running;await w.runNow();assert.equal(w.getSnapshot().publicAccountKey,'account:user_B');assert.equal(w.getSnapshot().data.items.length,0);assert.deepEqual((await cached(s,'user_A')).outbox[todo.id],queued);assert.equal((await s.services.user_B.list({})).items.length,0);
});

test('仅连接 AI 和撤销授权不关联匿名事项、不开启同步，修改草稿保护先于登录',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();const todo=createTodo('AI 连接不得上传',false,at);await add(w,todo);
  w.setChangeGuard(()=>false);await assert.rejects(w.requestSync(),/先保存或取消/);assert.equal(s.control.logins,0);w.setChangeGuard(()=>true);
  await w.connectAi();assert.equal(w.getState().grants.length,1);assert.equal(w.getSnapshot().publicAccountKey,'anonymous');assert.equal(w.getSnapshot().enabled,false);assert.equal(w.getSnapshot().data.items[0].id,todo.id);
  await w.revokeGrant('fixture-grant');assert.equal(w.getState().grants.length,0);assert.deepEqual(s.control.calls.map(call=>call.path),['/api/grants','/api/grants/fixture-grant','/api/grants']);assert.equal((await s.services.user_A.list({})).items.length,0);
});

test('本机保存失败不改变事项；暂停保留请求且不上传，恢复仍正常补传',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();await w.requestSync();const todo=createTodo('暂停编辑',false,at);await add(w,todo);await w.runNow();
  await w.enabled(false);await edit(w,todo.id,item=>renameItem(item,'暂停期间本机修改'));const snapshot=w.getSnapshot();await assert.rejects(w.save(data([renameItem(snapshot.data.items[0],'失败草稿')]),snapshot.revision-1),/更新/);assert.equal(w.getSnapshot().data.items[0].title,'暂停期间本机修改');
  const calls=s.control.calls.length;await w.runNow();assert.equal(s.control.calls.length,calls);assert.equal((await s.services.user_A.getItem({id:todo.id})).item.title,'暂停编辑');await w.enabled(true);await w.runNow();assert.equal((await s.services.user_A.getItem({id:todo.id})).item.title,'暂停期间本机修改');
});

test('账号切换过渡期间拒绝旧页面保存，不会将 A 内容写入正在读取的 B',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();await w.requestSync();const todo=createTodo('A 页面正在显示',false,at);await add(w,todo);
  const old=w.getSnapshot();let attempt;
  const off=w.subscribe(({state})=>{if(state.switching&&!attempt){attempt=w.save(old.data,old.revision);attempt.catch(()=>{});}});
  s.control.user='B';await w.requestSync();off();await assert.rejects(attempt,/账号空间正在切换/);assert.equal(w.getSnapshot().data.items.length,0);assert.equal((await cached(s,'user_A')).data.items[0].id,todo.id);assert.equal((await cached(s,'user_B')).data.items.length,0);
});

test('正常同步保留云端冲突对照，采用本机或云端仍由原冲突保存链处理',async t=>{
  for(const choice of ['local','remote'])await t.test(choice,async t=>{
    const s=fixture(t),w=s.workspace;await w.initialize();await w.requestSync();const todo=createTodo('冲突原稿',false,at);await add(w,todo);await w.runNow();
    const remote=await s.services.user_A.getItem({id:todo.id});await s.services.user_A.sync({id:todo.id,requestId:'remote-'+choice,expectedVersion:remote.version,item:renameItem(remote.item,'云端修改')});
    await edit(w,todo.id,item=>renameItem(item,'本机修改'));await w.runNow();const blocked=w.getSnapshot();assert.ok(blocked.blocked[todo.id].remote);assert.equal(blocked.data.items[0].title,'本机修改');
    await w.resolve({id:todo.id,choice,revision:blocked.revision,displayed:blocked.blocked[todo.id]});await w.runNow();assert.equal(w.getSnapshot().data.items.find(item=>item.id===todo.id).title,choice==='local'?'本机修改':'云端修改');assert.deepEqual(w.getSnapshot().blocked,{});if(choice==='remote')assert.ok(w.getSnapshot().data.items.some(item=>item.id!==todo.id&&item.title==='本机修改（冲突副本）'));
  });
});

test('Clerk 适配仅显式调用加载；校验账户 ID 且切号后原 token 提供器拒绝',async()=>{
  let loads=0,instance,fetches=0;class Clerk {constructor(){instance=this;this.user={id:'user_A'};this.session={getToken:async()=> 'fixture-token'};}async load(){}async signOut(){this.user=null;this.session=null;}}
  const identity=createPublicIdentity({config,loadSdk:async()=>{loads++;return {Clerk};},fetcher:async()=>{fetches++;return Response.json({id:'user_A',email:'a@example.invalid'});}});
  assert.equal(loads,0);assert.equal(fetches,0);const account=await identity.authenticate();assert.equal(loads,1);assert.equal(fetches,1);assert.equal(await account.getToken(),'fixture-token');instance.user={id:'user_B'};await assert.rejects(account.getToken(),{name:'AbortError'});await identity.signOut();
});

test('公开账号复用提醒离线同 ID 转入与补传，冷却和成就只归原账号且不进入业务请求',async t=>{
  const s=fixture(t),w=s.workspace;await w.initialize();await w.requestSync();const waiting=setReminderDate(createSimpleItem('waiting','公开账号提醒',at),'2026-11-20',at);await add(w,waiting);await w.runNow();
  s.control.online=false;await w.checkReminders('2026-11-19T08:00:00.000Z');let moved=w.getSnapshot().data.items[0];assert.equal(moved.id,waiting.id);assert.equal(moved.type,'todo');await w.runNow();assert.ok(w.getSnapshot().outbox[waiting.id]);
  const queue=createReminderQueue({storage:w.preferenceStorage(),now:()=>123456});assert.equal(queue.open([moved]).id,waiting.id);queue.acknowledge([moved]);
  s.control.online=true;await w.runNow();assert.equal((await s.services.user_A.getItem({id:waiting.id})).item.type,'todo');
  const before=w.getSnapshot();await w.save(data([toggleTodo(moved,'2026-12-19T08:00:00.000Z')]),before.revision,{localAction:{source:'ui',kind:'complete',id:waiting.id},actionTime:'2026-12-19T08:00:00.000Z'});assert.ok(w.getSnapshot().achievements.unlocked.old);await w.runNow();
  assert.equal(s.control.calls.some(call=>call.body?.includes('achievements')||call.body?.includes('unlocked')),false);
  s.control.user='B';await w.requestSync();assert.equal(w.getSnapshot().achievements,undefined);assert.equal(createReminderQueue({storage:w.preferenceStorage(),now:()=>123457}).open([moved]).id,waiting.id);
  s.control.user='A';await w.requestSync();assert.ok(w.getSnapshot().achievements.unlocked.old);assert.equal(createReminderQueue({storage:w.preferenceStorage(),now:()=>123458}).open([moved]),null);
});

test('Clerk 加载中取消不会继续登录或请求账户，且未验证回执不授予连接',async()=>{
  let release,calls=0;const waiting=new Promise(resolve=>release=resolve);class Clerk {constructor(){this.user={id:'user_A'};this.session={getToken:async()=> 'fixture-token'};}async load(){await waiting;}}
  const identity=createPublicIdentity({config,loadSdk:async()=>({Clerk}),fetcher:async()=>{calls++;return Response.json({id:'user_B',email:'b@example.invalid'});}});
  const login=identity.authenticate();identity.cancel();release();await assert.rejects(login,{name:'AbortError'});assert.equal(calls,0);await assert.rejects(identity.authenticate(),/身份核对/);
});
