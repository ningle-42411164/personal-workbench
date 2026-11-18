// 真实 Vue 组件 + 隔离 DOM/IndexedDB；不启动浏览器，不把它当作手机或真实 PWA 验收。
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';import {Window} from 'happy-dom';import {IDBFactory} from 'fake-indexeddb';
import {createPublicHarness} from '../services/workbench-api/test/public-harness.js';
import {createPublicWorkspace} from '../src/public/workspace.js';
import {publicStore} from '../src/public/store.js';
import {renameItem} from '../src/data/workbenchData.js';
const window=new Window({url:'http://127.0.0.1:5175/personal-workbench-public/'});
for(const key of ['window','document','Document','ShadowRoot','Element','HTMLElement','HTMLAnchorElement','SVGElement','Node','MutationObserver','ResizeObserver','Image','localStorage','sessionStorage'])globalThis[key]=key==='window'?window:window[key];
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
globalThis.indexedDB=new IDBFactory();globalThis.innerWidth=320;globalThis.innerHeight=700;
globalThis.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),16);globalThis.cancelAnimationFrame=clearTimeout;
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLCanvasElement.prototype.getContext=()=>null;
window.HTMLElement.prototype.showPopover=function(){};window.HTMLElement.prototype.hidePopover=function(){};
let exported;URL.createObjectURL=blob=>{exported=blob;return 'blob:isolated-public-export';};URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=function(){};
const requests=[];globalThis.fetch=async(...args)=>{requests.push(String(args[0]));throw Error('匿名页面不允许请求认证或业务服务');};
const {createApp,nextTick}=await import('vue');
const settle=async()=>{await nextTick();await new Promise(resolve=>setTimeout(resolve,15));await nextTick();};
const wait=async(fn)=>{for(let i=0;i<80;i++){if(fn())return;await settle();}throw Error('隔离页面未达到预期状态：'+document.body.textContent.slice(-1500));};
const aliases={'cloud/useCloudWorkbench.js':'public/cloud.js','sync/useSyncWorkbench.js':'public/usePublicWorkbench.js','cloud/cloudConfig.js':'public/cloudConfig.js','components/CloudConnection.vue':'offline/Empty.vue'};
async function compiledApp(workspace){
 globalThis.isolatedPublicWorkspace=workspace;
 const dir=path.resolve('.public-test');fs.mkdirSync(dir,{recursive:true});const output=path.join(dir,'app-'+crypto.randomUUID()+'.mjs');
 await build({entryPoints:['src/App.vue'],outfile:output,bundle:true,format:'esm',platform:'node',external:['vue','@clerk/clerk-js'],define:{'import.meta.env':JSON.stringify({MODE:'public'}),'import.meta.hot':'undefined'},logLevel:'silent',plugins:[{name:'public-ui-test',setup(builder){
  builder.onResolve({filter:/^virtual:pwa-register\/vue$/},()=>({path:'pwa-stub',namespace:'isolated'}));
  builder.onLoad({filter:/.*/,namespace:'isolated'},()=>({contents:"import {ref} from 'vue';export function useRegisterSW(){return {needRefresh:ref(false),updateServiceWorker(){}}}",loader:'js'}));
  builder.onResolve({filter:/\.(js|vue)$/},args=>{for(const [from,to]of Object.entries(aliases))if(args.path.endsWith('/'+from))return {path:path.resolve('src',to)};});
  builder.onLoad({filter:/\.(js|vue)$/},args=>{
   if(!args.path.replaceAll('\\','/').includes('/src/'))return;
   if(workspace&&args.path.replaceAll('\\','/').endsWith('/src/public/session.js'))return {contents:'export const publicWorkspace=globalThis.isolatedPublicWorkspace;',loader:'js'};
   let code=fs.readFileSync(args.path,'utf8');if(args.path.endsWith('.vue')){const {descriptor}=parse(code);code=descriptor.script||descriptor.scriptSetup?compileScript(descriptor,{id:args.path,inlineTemplate:true}).content:compileTemplate({source:descriptor.template?.content??'',filename:args.path,id:args.path}).code+'\nexport default {render};';}
   if(!args.path.replaceAll('\\','/').includes('/src/public/'))code=code.replaceAll('personal-workbench.','personal-workbench.public.');
   return {contents:code,loader:'js',resolveDir:path.dirname(args.path)};
  });
 }}]});return {output,component:(await import(pathToFileURL(output).href)).default};
}
function input(element,value){element.value=value;element.dispatchEvent(new window.Event('input',{bubbles:true}));}
function button(text,root=document){const result=[...root.querySelectorAll('button')].find(x=>x.textContent.trim()===text);assert.ok(result,'缺少按钮 '+text);return result;}
async function exportFromUi(){button('导出备份').click();await settle();assert.ok(exported);return JSON.parse(await exported.text());}

test('公开App匿名创建、编辑、完成、导出及关闭重开持久化，不加载登录或业务请求',async t=>{
 localStorage.setItem('personal-workbench.public.splash.enabled.v1','false');
 localStorage.setItem('personal-workbench.data.v2','私人空间哨兵，绝不可读取或覆盖');
 const originalPrivate=localStorage.getItem('personal-workbench.data.v2');
 const compiled=await compiledApp();let host=document.createElement('div');document.body.append(host);let app=createApp(compiled.component);app.mount(host);
 t.after(async()=>{app.unmount();host.remove();fs.unlinkSync(compiled.output);await window.happyDOM.abort();});
 await wait(()=>document.querySelector('#task-title')&&!document.querySelector('#task-title').disabled);
 assert.ok(document.body.textContent.includes('3.0.0'));assert.ok(document.body.textContent.includes('云功能暂不可用'));assert.equal(document.body.textContent.includes('所有者连接云端'),false);
 const checkbox=document.querySelector('.quick-options input');checkbox.checked=true;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));
 input(document.querySelector('#task-title'),'公开版临时待办');document.querySelector('.quick-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>document.querySelector('.todo-title')?.textContent.includes('公开版临时待办'));
 document.querySelector('.todo-title').click();await settle();document.querySelector('.ordinary-item .edit-button').click();await settle();
 input(document.querySelector('.ordinary-name-editor input'),'公开版临时待办已编辑');document.querySelector('.ordinary-name-editor').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>!document.querySelector('.ordinary-name-editor'));
 const check=document.querySelector('.todo-check input');check.checked=true;check.dispatchEvent(new window.Event('change',{bubbles:true}));
 await wait(()=>!document.querySelector('.todo-check input[aria-label="完成 公开版临时待办已编辑"]'));
 const before=await exportFromUi();assert.equal(before.items.length,1);assert.equal(before.items[0].title,'公开版临时待办已编辑');assert.equal(before.items[0].done,true);
 app.unmount();host.remove();await settle();
 const reopened=await import(pathToFileURL(compiled.output).href+'?reopened');host=document.createElement('div');document.body.append(host);app=createApp(reopened.default);app.mount(host);
 await wait(()=>document.querySelector('#task-title')&&!document.querySelector('#task-title').disabled);
 assert.deepEqual((await exportFromUi()).items,before.items);assert.deepEqual(requests,[]);assert.equal(localStorage.getItem('personal-workbench.data.v2'),originalPrivate);
});

test('隔离全链：MCP成功回执→正常30秒同步→真实App显示；A待上传切B不串库，撤销后拒绝', {timeout:65000},async t=>{
 const h=await createPublicHarness();const started=performance.now();let selected='A',online=true;const calls=[];
 const indexedDB=new IDBFactory(),database='public-http-ui-'+crypto.randomUUID();
 const identity={async authenticate(){const user=selected,account=await(await h.call('/api/account',{headers:h.browserHeaders(user)})).json();return {...account,async getToken(){if(selected!==user)throw Error('fixture account switched');return h.token(user);}};},async signOut(){},cancel(){}};
 const fetcher=async(url,init)=>{assert.equal(new URL(url).origin,h.base);calls.push({url,body:init.body,authorization:new Headers(init.headers).get('Authorization')});if(!online)throw TypeError('isolated offline');return h.call(url,init);};
 const workspace=createPublicWorkspace({indexedDB,database,storage:localStorage,identity,fetcher,config:{ready:true,apiUrl:h.base,mcpUrl:h.base+'/mcp'}});
 const compiled=await compiledApp(workspace);const host=document.createElement('div');document.body.append(host);const app=createApp(compiled.component);app.mount(host);
 t.after(async()=>{app.unmount();host.remove();await workspace.close();await h.dispose();fs.unlinkSync(compiled.output);await window.happyDOM.abort();});
 await wait(()=>document.querySelector('#task-title')&&!document.querySelector('#task-title').disabled);
 assert.equal(calls.length,0);await workspace.requestSync();await wait(()=>workspace.getStatus().phase==='ready');
 const auth=await h.authorize('A',{clientName:'Isolated cross-client example'});
 const sent=performance.now(),args={requestId:'public-ui-mcp-example',type:'todo',title:'A 的 MCP 隔离待办'};
 const created=await h.mcp(auth,'create_item',args),saved=performance.now();assert.equal(created.response.status,200);assert.equal(created.body.result.isError,undefined);
 const record=created.body.result.structuredContent;assert.ok(record.item.id);
 assert.deepEqual((await h.mcp(auth,'create_item',args)).body.result.structuredContent,record);
 // 不 runNow、不缩短轮询：复用正常同步引擎的30秒节奏，在实际 App 行文本出现时停止计时。
 const deadline=Date.now()+36000;
 while(!document.querySelector('.todo-title')?.textContent.includes(args.title)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
 assert.ok(document.querySelector('.todo-title')?.textContent.includes(args.title),'MCP记录应经正常同步呈现在工作台');
 const visible=performance.now();t.diagnostic(JSON.stringify({layer:'isolated-workerd-and-Vue-DOM',cloudSavedMs:Math.round(saved-sent),visibleAfterCloudSavedMs:Math.round(visible-saved),totalMs:Math.round(visible-started),pollIntervalMs:30000}));
 assert.equal(workspace.getSnapshot().data.items.filter(x=>x.id===record.item.id).length,1);
 online=false;const a=workspace.getSnapshot();await workspace.save({...a.data,items:a.data.items.map(item=>renameItem(item,'A 尚未上传的修改'))},a.revision);await workspace.runNow();
 const aStore=publicStore({indexedDB,name:database,id:'user_PublicA'});let original;try{original=(await aStore.read()).outbox[record.item.id];}finally{await aStore.close();}assert.ok(original?.requestId);
 selected='B';online=true;await workspace.requestSync();await wait(()=>workspace.getSnapshot().publicAccountKey==='account:user_PublicB'&&workspace.getStatus().phase==='ready');await settle();
 assert.equal(workspace.getSnapshot().data.items.length,0);assert.equal(document.querySelector('.todo-title'),null);
 assert.equal((await(await h.call('/api/items',{headers:h.browserHeaders('B')})).json()).items.length,0);
 assert.equal((await h.call('/api/items/'+record.item.id,{headers:h.browserHeaders('B')})).status,404);
 const bAuth=await h.authorize('B');const forbidden=await h.mcp(bAuth,'update_item',{requestId:'b-may-not-write-a',id:record.item.id,expectedVersion:record.version,fields:{title:'禁止越权'}});assert.equal(forbidden.body.result.isError,true);assert.match(forbidden.body.result.content[0].text,/NOT_FOUND/);
 const originalStore=publicStore({indexedDB,name:database,id:'user_PublicA'});try{assert.deepEqual((await originalStore.read()).outbox[record.item.id],original);}finally{await originalStore.close();}
 const grants=await(await h.call('/api/grants',{headers:h.browserHeaders('A')})).json();const grant=grants.items.find(x=>x.clientName==='Isolated cross-client example');assert.ok(grant);
 assert.equal((await h.call('/api/grants/'+grant.id,{method:'DELETE',headers:h.browserHeaders('A')})).status,200);
 assert.equal((await h.mcp(auth,'list_items')).response.status,401);
 assert.equal((await(await h.call('/api/items',{headers:h.browserHeaders('A')})).json()).items.length,1);
});

test('授权列表失败后 A 的下一条待办自动到达服务端一次', async t => {
  const h = await createPublicHarness();
  const identity = {async authenticate() {
    const response = await h.call('/api/account', {headers: h.browserHeaders('A')});
    assert.equal(response.status, 200);
    return {...await response.json(), getToken: async () => h.token('A')};
  }};
  const workspace = createPublicWorkspace({
    indexedDB: new IDBFactory(), storage: localStorage, identity,
    config: {ready: true, apiUrl: h.base, mcpUrl: h.base + '/mcp'},
    fetcher: (url, init) => new URL(url).pathname === '/api/grants'
      ? Response.json({}, {status: 503}) : h.call(url, init)
  });
  const compiled = await compiledApp(workspace);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(compiled.component);
  app.mount(host);
  t.after(async () => {
    app.unmount(); host.remove(); await workspace.close();
    await h.dispose(); fs.unlinkSync(compiled.output); await window.happyDOM.abort();
  });
  await wait(() => document.querySelector('#task-title')?.disabled === false);
  await workspace.requestSync();
  await wait(() => workspace.getStatus().phase === 'ready');
  const row = [...document.querySelectorAll('.footer-row')].find(el => el.textContent.includes('账号与云服务'));
  button('设置', row).click();
  await settle();
  button('连接 AI').click();
  await wait(() => document.querySelector('.public-account-panel [role=alert]'));
  const feedback = document.querySelector('.public-account-panel [role=alert]').textContent;
  document.querySelector('[aria-label="关闭账号与云服务"]').click();
  await settle();
  const title = '列表故障后正常保存';
  const checkbox = document.querySelector('.quick-options input');
  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event('change', {bubbles:true}));
  input(document.querySelector('#task-title'), title);
  document.querySelector('.quick-form').dispatchEvent(new window.Event('submit', {bubbles:true,cancelable:true}));
  await wait(() => workspace.getSnapshot().data.items.some(item => item.title === title));
  const local = workspace.getSnapshot().data.items.find(item => item.title === title);
  assert.equal(local.type, 'todo');
  let records;
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await h.call('/api/items', {headers: h.browserHeaders('A')});
    assert.equal(res.status, 200);
    records = (await res.json()).items;
    if (records.length) break;
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  assert.deepEqual(records.map(record => record.item.id), [local.id]);
  assert.match(feedback, /授权列表未能加载/);
});
