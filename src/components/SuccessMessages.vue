<script setup>
import { ref, watchEffect, onMounted, onBeforeUnmount } from 'vue';
import { effectHost } from '../data/effectHost.js';
const emit = defineEmits(['locate']);
const panel = ref(null);
const entries = ref([]);
const host = ref(document.body);
const timers = new Map();
let sequence = 0, observer;
function updateHost() {
  host.value = effectHost(document);
}
function push(text, target = null) {
  updateHost();
  const id = ++sequence;
  entries.value.push({ id, text, target });
  timers.set(id, setTimeout(() => {
    entries.value = entries.value.filter(entry => entry.id !== id);
    timers.delete(id);
  }, 2000));
}
// 原生 dialog 也在顶层。浮层作为它的子节点进入顶层，保留可点击性与视口定位。
watchEffect(() => {
  const node = panel.value?.$el;
  const count = entries.value.length;
  void host.value;
  if (count && node?.isConnected && !node.matches(':popover-open')) node.showPopover();
}, { flush:'post' });
onMounted(() => {
  observer = new MutationObserver(updateHost);
  observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['open'] });
});
onBeforeUnmount(() => { observer?.disconnect(); timers.forEach(clearTimeout); });
defineExpose({push});
</script>
<template>
  <Teleport :to="host">
    <TransitionGroup ref="panel" popover="manual" tag="div" name="success" class="success-queue" aria-live="polite" aria-relevant="additions">
      <component v-for="entry in entries" :is="entry.target ? 'button' : 'div'" :key="entry.id"
        :type="entry.target ? 'button' : undefined" class="success-entry" @mousedown.prevent @click="entry.target && emit('locate',entry.target)">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--positive)"/><path d="m4.5 8 2.4 2.4 4.6-5" fill="none" stroke="var(--primary-ink)" stroke-width="1.5"/></svg>
        <span>{{entry.text}}</span>
      </component>
    </TransitionGroup>
  </Teleport>
</template>
<style scoped>
.success-queue:popover-open { display:flex; }
.success-queue { inset:auto; margin:0; border:0; padding:0; background:transparent; overflow:visible; position:fixed; z-index:12; right:16px; bottom:calc(18px + env(safe-area-inset-bottom) + var(--achievement-notice-space, 0px)); flex-direction:column; align-items:end; gap:8px; max-width:calc(100vw - 32px); pointer-events:none; }
.success-entry { display:flex; align-items:center; gap:8px; max-width:100%; padding:9px 12px; background:var(--panel-1); color:var(--ink); border-radius:8px; box-shadow:0 3px 14px #243d3626; font-size:14px; }
.success-entry svg { flex:none; }
.success-entry span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
button.success-entry { pointer-events:auto; }
.success-leave-active,.success-move { transition:opacity .2s, transform .2s; }
.success-leave-to { opacity:0; }
@media(prefers-reduced-motion:reduce) { .success-leave-active,.success-move { transition:none; } }
</style>
