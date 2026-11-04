<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

const root = ref(null);
const open = ref(false);
let touch = false;

function pointerDown(event) {
  touch = event.pointerType === 'touch' || event.pointerType === 'pen';
}
function outside(event) {
  if (!root.value.contains(event.target)) open.value = false;
}
function escape(event) {
  if (event.key === 'Escape') open.value = false;
}
onMounted(() => {
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', escape);
});
</script>

<template>
  <span ref="root" class="quick-help" @pointerenter="e => { if (e.pointerType === 'mouse') open = true }"
    @pointerleave="e => { if (e.pointerType === 'mouse') open = false }">
    <button type="button" aria-label="快速记录说明" aria-describedby="quick-record-help"
      @pointerdown="pointerDown" @focus="!touch && (open = true)" @blur="open = false; touch = false"
      @click="open = touch ? !open : true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4m0-6.5v.2"/></svg>
    </button>
    <span v-show="open" id="quick-record-help" role="tooltip"><slot /></span>
  </span>
</template>

<style scoped>
.quick-help { display:inline-flex; position:relative; flex:0 0 16px; align-self:center; }
.quick-help button { position:relative; display:grid; place-items:center; width:16px; height:16px; min-height:0; padding:0; background:transparent; color:#718078; line-height:1; }
.quick-help button svg { display:block; width:13px; height:13px; }
@media (pointer:coarse) { .quick-help button::after { content:""; position:absolute; inset:-6px -10px -6px -3px; } }
[role=tooltip] { position:absolute; bottom:100%; left:-3.5rem; z-index:5; width:max-content; max-width:min(16rem,65vw); padding:8px 12px; border-radius:8px; background:#244d43; color:white; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
</style>
