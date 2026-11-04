<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue';
const props=defineProps({snapshot:Object,status:Object,auth:Object});
const online=ref(navigator.onLine);
const refresh=()=>{online.value=navigator.onLine};
onMounted(()=>{window.addEventListener('online',refresh);window.addEventListener('offline',refresh)});
onBeforeUnmount(()=>{window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh)});
const count=computed(()=>Object.keys(props.snapshot?.dirty??{}).length);
const conflicts=computed(()=>Object.keys(props.snapshot?.blocked??{}).length);
const mode=computed(()=>{
  if(!props.snapshot?.enabled)return 'local';
  if(!online.value || props.status.phase==='offline')return 'offline';
  if(conflicts.value)return 'conflict';
  if(['failed','login','permission'].includes(props.status.phase))return 'failed';
  if(props.status.phase==='syncing')return 'syncing';
  if(count.value || props.status.phase!=='ready' || !props.auth?.canWrite || !props.status.lastSuccess)return 'pending';
  return 'ready';
});
const labels={local:'本机保存',pending:'待同步',syncing:'同步中',ready:'已同步',offline:'离线',failed:'同步未完成',conflict:'存在冲突'};
const marks={pending:'◷',syncing:'↻',ready:'✓',offline:'∕',failed:'×',conflict:'!'};
</script>
<template><button type="button" class="sync-symbol" :class="mode" :aria-label="labels[mode]" popovertarget="sync-summary"><svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.7" fill="none" aria-hidden="true"><path v-if="mode==='local'" d="M2 14l4-9h12l4 9v5H2zm0 0h20M5 17h2"/><path v-else d="M7 18a6 6 0 1 1 1-12 7 7 0 0 1 12 4 4 4 0 0 1-1 8z"/></svg><b v-if="mode!=='local'">{{marks[mode]}}</b></button><div popover="auto" id="sync-summary">{{labels[mode]}}<template v-if="mode!=='local'"> · 待同步 {{count}} 项 · 待核对 {{conflicts}} 项<br>{{status.message}}</template></div></template>
<style scoped>
.sync-symbol{float:right;position:relative;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#e6eee6;color:#476555;padding:0;anchor-name:--sync-icon}.sync-symbol b{position:absolute;right:-2px;bottom:-1px;border-radius:50%;background:#f4f7f2;font-size:14px;line-height:18px;width:18px}.failed{color:#a53c33}.pending,.conflict{color:#805e15}.ready{color:#286044}#sync-summary{position:fixed;inset:auto;top:anchor(bottom);right:anchor(right);position-anchor:--sync-icon;max-width:min(290px,88vw);border:1px solid #d3ddd5;border-radius:10px;padding:12px;color:#243d36}
</style>
