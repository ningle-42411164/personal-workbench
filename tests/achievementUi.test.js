// 隔离 DOM 组件测试，不启动浏览器；不把模拟 dialog/Popover 当作真实顶层或手机布局验收。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
import {parse,compileScript} from '@vue/compiler-sfc';
import {emptyAchievements,ACHIEVEMENTS} from '../src/data/achievements.js';
const window=new Window({url:'https://isolated.invalid/'});
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','MutationObserver','ResizeObserver'])globalThis[key]=key==='window'?window:window[key];
globalThis.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),16);
globalThis.cancelAnimationFrame=clearTimeout;
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-test-popover','open');};
window.HTMLElement.prototype.hidePopover=function(){this.removeAttribute('data-test-popover');};
const matches=window.Element.prototype.matches;
window.Element.prototype.matches=function(selector){return selector===':popover-open'?this.hasAttribute('data-test-popover'):matches.call(this,selector);};
window.HTMLElement.prototype.scrollIntoView=function(){};
window.HTMLCanvasElement.prototype.getContext=()=>null;
const {createApp,h,ref,nextTick}=await import('vue');
const cache=new Map();
async function component(name){
  const url=new URL('../src/components/'+name,import.meta.url);
  async function compile(url){if(cache.has(url.href))return cache.get(url.href);const {descriptor}=parse(fs.readFileSync(url,'utf8'));let code=compileScript(descriptor,{id:url.href,inlineTemplate:true}).content;
    for(const match of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)]){const spec=match[1];const target=spec.endsWith('.vue')?await compile(new URL(spec,url)):spec.startsWith('.')?new URL(spec,url).href:import.meta.resolve(spec);code=code.replaceAll(`'${spec}'`,JSON.stringify(target)).replaceAll(`"${spec}"`,JSON.stringify(target));}
    const compiled='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(url.href,compiled);return compiled;}
  return (await import(await compile(url))).default;
}
const Card=await component('ProjectCard.vue'),Hall=await component('AchievementHall.vue'),Cloud=await component('CloudConnection.vue'),Sync=await component('SyncSettings.vue'),Effects=await component('CelebrationEffects.vue'),Success=await component('SuccessMessages.vue');
const settle=async()=>{await nextTick();await new Promise(resolve=>setImmediate(resolve));await nextTick();};
function mount(t,root){const target=document.createElement('div');document.body.append(target);const app=createApp(root);app.mount(target);t.after(()=>{app.unmount();target.remove();});return app;}

test('成就馆真实组件：未解锁DOM及可访问属性不含条件；解锁后详情、回放不写存档',async t=>{
  const archive=ref(emptyAchievements()),selected=ref(null),replays=[];
  mount(t,{render:()=>h(Hall,{archive:archive.value,selected:selected.value,onReplay:id=>replays.push(id)})});await settle();
  let hall=document.querySelector('.achievement-hall');assert.equal(hall.querySelectorAll('.locked').length,5);
  for(const entry of ACHIEVEMENTS){assert.ok(hall.textContent.includes(entry.name));assert.equal(hall.outerHTML.includes(entry.condition),false);}
  assert.equal(hall.querySelectorAll('button').length,0);
  archive.value={...emptyAchievements(),unlocked:{rapid:'2026-11-14T01:00:00.000Z',old:'2026-11-14T02:00:00.000Z'}};await settle();
  assert.ok(hall.querySelector('.unlocked').textContent.includes('压箱底终结者'));
  hall.querySelector('.unlocked').click();await settle();const before=JSON.stringify(archive.value);
  hall.querySelector('.achievement-detail button').click();assert.deepEqual(replays,['old']);assert.equal(JSON.stringify(archive.value),before);
});

test('云端弹窗关闭重开保留冲突选择、浏览器引导及组件实例，不触发登录或同步',async t=>{
  const nativeMatch=window.matchMedia.bind(window);window.matchMedia=query=>query.includes('display-mode')?{matches:true}:nativeMatch(query);t.after(()=>window.matchMedia=nativeMatch);
  const open=ref(false),events=[];const item={id:'conflict',type:'todo',title:'本机',done:false};
  const state={auth:{state:'disconnected',canWrite:false,remembered:true},message:''};
  const snapshot={data:{schemaVersion:2,items:[item]},dirty:{conflict:true},enabled:true,revision:1,bindings:{},blocked:{conflict:{kind:'conflict',remote:{item:{...item,title:'云端'},version:2},message:'请核对'}}};
  const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();t.after(()=>trigger.remove());
  mount(t,{render:()=>h(Card,{title:'云端连接',open:open.value,requestClose:()=>open.value=false},{default:()=>[h(Cloud,{state,onLogin:()=>events.push('login'),onResume:()=>events.push('resume')}),h(Sync,{snapshot,status:{message:'待同步',phase:'pending'},connection:state,onEnabled:()=>events.push('sync'),onResolve:()=>events.push('resolve')})]})});
  const dialog=document.querySelector('dialog');assert.equal(dialog.open,false);open.value=true;await settle();assert.equal(dialog.open,true);
  [...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('所有者连接云端')).click();await settle();assert.ok(dialog.textContent.includes('点击页尾'));
  const select=dialog.querySelector('select');assert.ok(select);select.value='local';select.dispatchEvent(new window.Event('change'));await settle();
  dialog.querySelector('.project-close').click();await settle();assert.equal(dialog.open,false);assert.equal(document.activeElement,trigger);
  open.value=true;await settle();assert.equal(dialog.querySelector('select'),select);assert.equal(select.value,'local');assert.ok(dialog.textContent.includes('已在浏览器完成，检查连接'));assert.deepEqual(events,[]);
});

test('效果组件：两种提示共存，dialog宿主切换保留当前成就与礼炮，无额外重播',async t=>{
  const effects=ref(null),success=ref(null),open=ref(false);
  mount(t,{render:()=>h('div',[h(Effects,{ref:effects}),h(Success,{ref:success}),h(Card,{title:'项目',open:open.value,requestClose:()=>open.value=false})])});
  effects.value.accept({unlocked:['rapid','old'],project:{id:'p',title:'临时项目'}});success.value.push('已完成项目');await settle();
  const popup=document.querySelector('.achievement-popup');assert.ok(popup.textContent.includes('我去你咋这么牛逼'));assert.ok(document.querySelector('.success-entry'));assert.ok(document.querySelector('.project-cheer'));
  open.value=true;await settle();await settle();assert.equal(popup.closest('dialog')?.open,true);assert.ok(document.querySelector('.project-cheer').closest('dialog'));assert.equal(document.querySelectorAll('.achievement-popup').length,1);
  open.value=false;await settle();await settle();assert.equal(popup.closest('dialog'),null);assert.ok(popup.textContent.includes('我去你咋这么牛逼'));
  popup.querySelector('.popup-close').click();await settle();assert.ok(document.querySelector('.achievement-popup').textContent.includes('压箱底终结者'));
});

test('常驻dialog按打开顺序承载效果；减少动画保留静态反馈且不绘制礼炮',async t=>{
  const effects=ref(null),first=ref(false),second=ref(false);let paints=0;
  const originalContext=window.HTMLCanvasElement.prototype.getContext,originalMatch=window.matchMedia.bind(window);
  window.HTMLCanvasElement.prototype.getContext=()=>({save(){},restore(){},translate(){},rotate(){},fillRect(){paints++;}});
  window.matchMedia=query=>query.includes('reduced-motion')?{matches:true,addEventListener(){},removeEventListener(){}}:originalMatch(query);
  t.after(()=>{window.HTMLCanvasElement.prototype.getContext=originalContext;window.matchMedia=originalMatch;});
  mount(t,{render:()=>h('div',[h(Effects,{ref:effects}),h(Card,{title:'先挂载后打开',open:first.value}),h(Card,{title:'后挂载先打开',open:second.value})])});
  second.value=true;await settle();first.value=true;await settle();effects.value.accept({unlocked:['daily'],project:{id:'p',title:'项目'}});await settle();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(document.querySelector('.achievement-popup').closest('dialog').getAttribute('aria-label'),'先挂载后打开');assert.ok(document.querySelector('.project-cheer'));assert.equal(paints,0);
  first.value=false;await settle();await settle();assert.equal(document.querySelector('.achievement-popup').closest('dialog').getAttribute('aria-label'),'后挂载先打开');
});
test('叠层弹窗下层先关闭不会解锁页面；最后关闭恢复原滚动与焦点',async t=>{
  const lower=ref(false),upper=ref(false),trigger=document.createElement('button');document.body.append(trigger);trigger.focus();t.after(()=>trigger.remove());
  const original=document.body.style.overflow;
  mount(t,{render:()=>h('div',[h(Card,{title:'项目',open:lower.value}),h(Card,{title:'成就馆',open:upper.value})])});
  lower.value=true;await settle();upper.value=true;await settle();lower.value=false;await settle();assert.equal(document.body.style.overflow,'hidden');
  upper.value=false;await settle();assert.equal(document.body.style.overflow,original);assert.equal(document.activeElement,trigger);
});
