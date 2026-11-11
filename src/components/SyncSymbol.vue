<script setup>
import {computed,ref,useId,onMounted,onBeforeUnmount} from 'vue';
const props=defineProps({snapshot:Object,status:Object,auth:Object});
const count=computed(()=>Object.keys(props.snapshot?.dirty??{}).length);
const conflicts=computed(()=>Object.keys(props.snapshot?.blocked??{}).length);
const mode=computed(()=>{
  if(!props.snapshot?.enabled)return 'local';
  if(props.status.phase==='offline')return 'offline';
  if(conflicts.value)return 'conflict';
  if(['failed','login','permission'].includes(props.status.phase))return 'failed';
  if(props.status.phase==='syncing')return 'syncing';
  if(count.value || props.status.phase!=='ready' || !props.auth?.canWrite || !props.status.lastSuccess)return 'pending';
  return 'ready';
});
const labels={local:'本机保存',pending:'待同步',syncing:'同步中',ready:'已同步',offline:'离线',failed:'同步未完成',conflict:'存在冲突'};
// 展开说明只影响浮层；数据来源仍是上面的同步状态和队列快照。
const control = ref(null);
const expanded = ref(false);
function dismissOutside(event) {
  if (!control.value?.contains(event.target)) expanded.value = false;
}
function dismissEscape(event) {
  if (event.key === 'Escape') expanded.value = false;
}
onMounted(() => {
  document.addEventListener('pointerdown', dismissOutside, true);
  document.addEventListener('keydown', dismissEscape);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside, true);
  document.removeEventListener('keydown', dismissEscape);
});
const summaryId = useId();
</script>

<template>
  <div ref="control" class="sync-control" @click.stop>
    <button type="button" class="sync-symbol" :class="mode" :aria-label="labels[mode]"
      :aria-expanded="expanded" :aria-controls="summaryId" @click="expanded = !expanded">
      <svg class="sync-main" viewBox="0 0 24 24" aria-hidden="true">
        <path v-if="mode === 'local'" d="m2.5 14 3-8a2 2 0 0 1 2-1.4h9a2 2 0 0 1 2 1.4l3 8M4 13h16a1.5 1.5 0 0 1 1.5 1.5V18a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-3.5A1.5 1.5 0 0 1 4 13Zm2 3.5h1m3 0h.2"/>
        <path v-else d="M7 18.5a5.8 5.8 0 1 1 1.8-11.3 7 7 0 0 1 12 4.2A3.7 3.7 0 0 1 19 18.5Z"/>
      </svg>
      <span v-if="mode !== 'local'" class="sync-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <g v-if="mode === 'pending'"><circle cx="8" cy="8" r="6"/><path d="M8 4v4h3"/></g>
          <path v-else-if="mode === 'syncing'" d="M2.5 7a5.5 5.5 0 0 1 9.8-2.6L14 6m0-4v4h-4M13.5 9a5.5 5.5 0 0 1-9.8 2.6L2 10m0 4v-4h4"/>
          <path v-else-if="mode === 'ready'" d="m2.5 8 3.6 3.6 7.4-7.4"/>
          <path v-else-if="mode === 'offline'" d="m2 2 12 12M5 5a4 4 0 0 0 0 8h5M7.8 3.5a4.4 4.4 0 0 1 5.5 4.2 2.6 2.6 0 0 1 1 4.1"/>
          <path v-else-if="mode === 'failed'" d="m3 3 10 10m0-10L3 13"/>
          <path v-else d="M7.2 2.7a.9.9 0 0 1 1.6 0l6 10.4a.8.8 0 0 1-.7 1.2H1.9a.8.8 0 0 1-.7-1.2ZM8 6v3.5m0 2v.2"/>
        </svg>
      </span>
    </button>
    <div v-show="expanded" :id="summaryId" class="sync-summary">
      {{ labels[mode] }}<template v-if="mode !== 'local'"> · 待同步 {{ count }} 项 · 待核对 {{ conflicts }} 项<br>{{ status.message }}</template>
    </div>
  </div>
</template>

<style scoped>
.sync-control { position:relative; flex:0 0 44px; width:44px; height:44px; overflow:visible; }
header > .sync-control { position:absolute; top:-13px; right:0; }
.sync-symbol { position:relative; width:44px; height:44px; display:grid; place-items:center; padding:0; border:0; border-radius:50%; background:var(--date-from); color:var(--muted); }
.sync-symbol svg { display:block; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.sync-symbol .sync-main { width:21px; height:21px; }
.sync-badge { position:absolute; right:0; bottom:0; display:grid; place-items:center; width:17px; height:17px; border-radius:50%; background:var(--panel-1); box-shadow:0 0 0 2px var(--page); }
.sync-badge svg { width:12px; height:12px; }
.failed { color:var(--danger-2); }
.pending,.conflict { color:var(--warning-2); }
.ready { color:var(--positive); }
.sync-summary { position:absolute; z-index:5; right:0; top:calc(100% + 6px); width:max-content; max-width:min(18rem,calc(100vw - 40px)); overflow-wrap:anywhere; padding:10px 12px; background:var(--panel-1); border:1px solid var(--line-4); border-radius:10px; color:var(--ink); font-size:.875rem; }
</style>
