// 隔离 DOM 中运行真实 App 与公开保存链，不启动浏览器或读取所有者浏览器数据。
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';import {Window} from 'happy-dom';import {IDBFactory} from 'fake-indexeddb';
import {createPublicWorkspace} from '../src/public/workspace.js';import {publicStore} from '../src/public/store.js';import {createTodo} from '../src/data/workbenchData.js';import {emptyAchievements} from '../src/data/achievements.js';
const window=new Window({url:'http://127.0.0.1:5175/personal-workbench-public/'});
for(const key of ['window','document','Element','HTMLElement','HTMLAnchorElement','SVGElement','Node','MutationObserver','ResizeObserver','Image','localStorage','sessionStorage'])globalThis[key]=key==='window'?window:window[key];
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});globalThis.indexedDB=new IDBFactory();globalThis.innerWidth=320;globalThis.innerHeight=700;
globalThis.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),16);globalThis.cancelAnimationFrame=clearTimeout;
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLCanvasElement.prototype.getContext=()=>null;
window.HTMLElement.prototype.showPopover=function(){};window.HTMLElement.prototype.hidePopover=function(){};
let exported;URL.createObjectURL=blob=>{exported=blob;return 'blob:public-account-test';};URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=function(){};
const {createApp,nextTick}=await import('vue');
const settle=async()=>{await nextTick();await new Promise(resolve=>setTimeout(resolve,10));await nextTick();};
const wait=async(fn)=>{for(let i=0;i<80;i++){if(fn())return;await settle();}throw Error('隔离账号页面未达到预期：'+document.body.textContent.slice(-1200));};
const aliases={'cloud/useCloudWorkbench.js':'public/cloud.js','sync/useSyncWorkbench.js':'public/usePublicWorkbench.js','cloud/cloudConfig.js':'public/cloudConfig.js','components/CloudConnection.vue':'offline/Empty.vue'};
async function component(){const dir=path.resolve('.public-test');fs.mkdirSync(dir,{recursive:true});const output=path.join(dir,'account-'+crypto.randomUUID()+'.mjs');
 await build({entryPoints:['src/App.vue'],outfile:output,bundle:true,format:'esm',platform:'node',external:['vue','@clerk/clerk-js'],define:{'import.meta.env':JSON.stringify({MODE:'public'}),'import.meta.hot':'undefined'},logLevel:'silent',plugins:[{name:'account-ui-test',setup(builder){
  builder.onResolve({filter:/session\.js$/},args=>args.importer.replaceAll('\\','/').includes('/src/public/')?{path:'session',namespace:'isolated'}:undefined);
  builder.onResolve({filter:/^virtual:pwa-register\/vue$/},()=>({path:'pwa',namespace:'isolated'}));
  builder.onLoad({filter:/.*/,namespace:'isolated'},args=>({contents:args.path==='session'?'export const publicWorkspace=globalThis.__isolatedPublicWorkspace;':"import {ref} from 'vue';export function useRegisterSW(){return {needRefresh:ref(false),updateServiceWorker(){}}}",loader:'js'}));
  builder.onResolve({filter:/\.(js|vue)$/},args=>{for(const [from,to]of Object.entries(aliases))if(args.path.endsWith('/'+from))return {path:path.resolve('src',to)};});
  builder.onLoad({filter:/\.(js|vue)$/},args=>{if(!args.path.replaceAll('\\','/').includes('/src/'))return;let code=fs.readFileSync(args.path,'utf8');if(args.path.endsWith('.vue')){const {descriptor}=parse(code);code=descriptor.script||descriptor.scriptSetup?compileScript(descriptor,{id:args.path,inlineTemplate:true}).content:compileTemplate({source:descriptor.template?.content??'',filename:args.path,id:args.path}).code+'\nexport default {render};';}if(!args.path.replaceAll('\\','/').includes('/src/public/'))code=code.replaceAll('personal-workbench.','personal-workbench.public.');return {contents:code,loader:'js',resolveDir:path.dirname(args.path)};});
 }}]});return {output,App:(await import(pathToFileURL(output).href)).default};}
const btn=text=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);assert.ok(button,'missing '+text);return button;};
const input=(element,value)=>{element.value=value;element.dispatchEvent(new window.Event('input',{bubbles:true}));};

test('真实 App 切换同 revision 的 A/B 后仅保存 B，成就、规则、子组件草稿和恢复缓存按账号隔离',async t=>{
  const database='public-account-ui-'+crypto.randomUUID(),idb=globalThis.indexedDB;let user='A';
  const identity={async authenticate(){const id='user_'+user;return {id,email:user+'@example.invalid',getToken:async()=>id};},async signOut(){},cancel(){}};
  const workspace=createPublicWorkspace({indexedDB:idb,database,storage:localStorage,identity,config:{ready:true,apiUrl:'https://isolated.test',mcpUrl:'https://isolated.test/mcp'},fetcher:async()=>{throw Error('No network in account DOM test');},engineOptions:{schedule:()=>1,cancel:()=>{}}});
  globalThis.__isolatedPublicWorkspace=workspace;localStorage.setItem('personal-workbench.public.splash.enabled.v1','false');
  const item=createTodo('A 标题不得进入 B',false,'2026-11-18T12:00:00.000Z');
  for(const account of ['A','B']){const store=publicStore({indexedDB:idb,name:database,id:'user_'+account});const state=await store.read(),archive=emptyAchievements();if(account==='A')archive.unlocked.old='2026-11-18T12:00:00.000Z';await store.save({schemaVersion:2,items:[{...item,title:account==='A'?item.title:'B 的独立标题',tags:[account+'标签']}]},state.revision,{importing:true,importedAchievements:archive});await store.close();localStorage.setItem('personal-workbench.public.preference:account:user_'+account+':personal-workbench.public.tag-rules.v1',JSON.stringify([{keyword:'规则',tag:account+'标签'}]));}
  const built=await component(),host=document.createElement('div');document.body.append(host);const app=createApp(built.App);app.mount(host);t.after(async()=>{app.unmount();host.remove();await workspace.close();fs.unlinkSync(built.output);await window.happyDOM.abort();});
  await wait(()=>!document.querySelector('#task-title')?.disabled);
  await workspace.requestSync();await wait(()=>document.querySelector('.todo-title')?.textContent.includes('A 标题'));const aRevision=workspace.getSnapshot().revision;
  input(document.querySelector('#task-title'),'规则匹配');await settle();assert.ok(document.querySelector('.quick-tag-selection').textContent.includes('A标签'));input(document.querySelector('#task-title'),'');await settle();
  workspace.preferenceStorage().setItem('test-cooldown','A');
  document.querySelector('.todo-title').click();await settle();document.querySelector('.ordinary-item .edit-button').click();await settle();input(document.querySelector('.ordinary-name-editor input'),'A 未保存草稿');
  user='B';await assert.rejects(workspace.requestSync(),/先保存或取消/);assert.equal(document.querySelector('.ordinary-name-editor input').value,'A 未保存草稿');btn('取消').click();await wait(()=>!document.querySelector('.ordinary-name-editor'));
  await workspace.requestSync();await wait(()=>document.querySelector('.todo-title')?.textContent.includes('B 的独立标题'));assert.equal(workspace.getSnapshot().revision,aRevision);assert.equal(workspace.preferenceStorage().getItem('test-cooldown'),null);assert.equal(document.body.textContent.includes('A 标题不得进入 B'),false);
  input(document.querySelector('#task-title'),'规则匹配');await settle();assert.ok(document.querySelector('.quick-tag-selection').textContent.includes('B标签'));assert.equal(document.querySelector('.quick-tag-selection').textContent.includes('A标签'),false);input(document.querySelector('#task-title'),'');await settle();
  btn('导出备份').click();await settle();const backup=JSON.parse(await exported.text());assert.deepEqual(backup.achievements.unlocked,{});assert.equal(backup.items[0].title,'B 的独立标题');
  document.querySelector('.todo-title').click();await settle();document.querySelector('.ordinary-item .edit-button').click();await settle();input(document.querySelector('.ordinary-name-editor input'),'B 编辑后只写 B');document.querySelector('.ordinary-name-editor').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!document.querySelector('.ordinary-name-editor'));
  const a=publicStore({indexedDB:idb,name:database,id:'user_A'}),b=publicStore({indexedDB:idb,name:database,id:'user_B'});try{assert.equal((await a.read()).data.items[0].title,item.title);assert.equal((await b.read()).data.items[0].title,'B 编辑后只写 B');}finally{await a.close();await b.close();}
});
