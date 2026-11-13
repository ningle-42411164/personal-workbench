<script setup>
import {ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import AchievementIcon from './AchievementIcon.vue';
import {ACHIEVEMENTS} from '../data/achievements.js';
import {createCelebrationQueue} from '../data/celebrationQueue.js';
import {effectHost} from '../data/effectHost.js';
const emit=defineEmits(['open']);
const host=ref(document.body),panel=ref(null),popup=ref(null),canvas=ref(null);
const active=ref(null),project=ref(null),cheer=ref(false);
let observer,resizeObserver,frame,cheerTimer,started=0,particles=[];
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced=ref(motion.matches);
const motionChanged=()=>{reduced.value=motion.matches;};
const notices=createCelebrationQueue({show:item=>{active.value=item;},hide:()=>{active.value=null;}});
const projects=createCelebrationQueue({duration:3400,show:item=>{
  project.value=item;cheer.value=true;started=performance.now();
  particles=Array.from({length:100},(_,i)=>({side:i%2,vx:2+Math.random()*5.5,vy:-9-Math.random()*10,spin:Math.random()*6,size:3+Math.random()*5,color:['#a6d572','#e6c881','#8fcbd3','#d69ac2','#eef4f7'][i%5]}));
  clearTimeout(cheerTimer);cheerTimer=setTimeout(()=>cheer.value=false,2800);
},hide:()=>{project.value=null;cheer.value=false;}});
function replay(id){const item=ACHIEVEMENTS.find(a=>a.id===id);if(item)notices.push(item);}
function accept(effects){for(const id of effects?.unlocked??[])replay(id);if(effects?.project)projects.push(effects.project);}
function open(){const id=active.value?.id;notices.dismiss();if(id)emit('open',id);}
function updateHost(){host.value=effectHost(document);}
function reserveSpace(){document.documentElement.style.setProperty('--achievement-notice-space',active.value?`${(popup.value?.getBoundingClientRect().height??120)+8}px`:'0px');}
async function reveal(){
  await nextTick();
  if((active.value||project.value) && panel.value?.isConnected && !panel.value.matches(':popover-open'))panel.value.showPopover?.();
  if(!active.value&&!project.value)panel.value?.hidePopover?.();
  resizeObserver?.disconnect();if(popup.value)resizeObserver?.observe(popup.value);
  reserveSpace();
}
watch([host,active,project],reveal,{flush:'post'});
// 按绝对起始时间绘制，宿主移到/移出 dialog 不重启动画，也不重置展示队列计时。
function draw(now){
  const node=canvas.value,ctx=node?.getContext('2d');
  if(ctx){const width=window.innerWidth,height=window.innerHeight;node.width=width;node.height=height;
    if(!reduced.value && project.value){const age=now-started,t=age/16.67;ctx.globalAlpha=Math.max(0,Math.min(1,(3400-age)/750));
      for(const p of particles){const x=(p.side?width-8:8)+(p.side?-1:1)*p.vx*t*.8,y=height*.63+p.vy*t+.115*t*t;ctx.save();ctx.translate(x,y);ctx.rotate(p.spin+t*.08);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/4,p.size,p.size/2);ctx.restore();}
    }
  }
  if(project.value)frame=requestAnimationFrame(draw);
}
watch(project,value=>{cancelAnimationFrame(frame);if(value)frame=requestAnimationFrame(draw);},{flush:'post'});
onMounted(()=>{observer=new MutationObserver(updateHost);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});resizeObserver=new ResizeObserver(reserveSpace);motion.addEventListener('change',motionChanged);});
onBeforeUnmount(()=>{observer?.disconnect();resizeObserver?.disconnect();motion.removeEventListener('change',motionChanged);notices.dispose();projects.dispose();clearTimeout(cheerTimer);cancelAnimationFrame(frame);document.documentElement.style.removeProperty('--achievement-notice-space');});
defineExpose({accept,replay});
</script>
<template>
  <Teleport :to="host">
    <div ref="panel" popover="manual" class="celebration-layer">
      <canvas v-if="project" ref="canvas" class="confetti-canvas" aria-hidden="true" />
      <div v-if="project && cheer" class="project-cheer" role="status"><AchievementIcon name="party" /><strong>这个项目，拿下！</strong><span>{{project.title}}</span></div>
      <article v-if="active" ref="popup" class="achievement-popup" aria-label="成就解锁通知">
        <button type="button" class="popup-main" @click="open"><span class="popup-emblem"><AchievementIcon :name="active.icon" /></span><span class="popup-copy" role="status"><small>成就已解锁</small><strong>{{active.name}}</strong><span>{{active.condition}}</span></span></button>
        <button type="button" class="popup-close" aria-label="关闭成就提醒" @click="notices.dismiss">×</button>
      </article>
    </div>
  </Teleport>
</template>
<style scoped>
.celebration-layer{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;overflow:visible;background:transparent;pointer-events:none;color:var(--ink)}.confetti-canvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}.project-cheer{box-sizing:border-box;position:fixed;top:30%;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;width:min(420px,calc(100vw - 52px));max-height:50dvh;overflow:hidden;padding:19px 15px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 30px #0002;text-align:center;overflow-wrap:anywhere}.project-cheer>svg{width:32px;height:32px;color:var(--primary)}.project-cheer strong{font-size:23px;font-weight:500}.project-cheer span{font-size:13px;color:var(--muted)}.achievement-popup{box-sizing:border-box;position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom));width:min(340px,calc(100vw - 32px));display:grid;grid-template-columns:minmax(0,1fr) 44px;background:linear-gradient(110deg,#273526,#1d2928);border:1px solid #485446;border-top:2px solid #a6d572;border-radius:5px;color:#eef4f7;box-shadow:0 9px 30px #0005;pointer-events:auto}.popup-main{display:flex;align-items:center;gap:11px;min-width:0;padding:12px 0 12px 12px;text-align:left;background:transparent;color:inherit;border-radius:0;min-height:72px}.popup-emblem{display:grid;place-items:center;flex:0 0 45px;height:48px;color:#e6c881;border:1px solid #776b48;border-radius:4px;background:linear-gradient(145deg,#5a5135,#2c302c)}.popup-emblem svg{width:26px;height:26px}.popup-copy{display:flex;flex-direction:column;gap:3px;min-width:0;overflow-wrap:anywhere}.popup-copy small{color:#a6d572;font-size:11px}.popup-copy strong{font-size:14px;font-weight:500}.popup-copy>span{font-size:12px;color:#a1b2c1;line-height:1.5}.popup-close{width:44px;min-height:44px;padding:0;align-self:start;font-size:24px;border-radius:0;background:transparent;color:#a1b2c1}
</style>
