<script setup>
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';

defineProps({ label:{type:String,default:'快速记录说明'}, below:Boolean });
const contentId = useId();
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
  if (open.value && event.key === 'Escape') { event.preventDefault(); open.value = false; }
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
    <button type="button" :aria-label="label" :aria-describedby="contentId"
      @pointerdown="pointerDown" @focus="!touch && (open = true)" @blur="open = false; touch = false"
      @click="open = touch ? !open : true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M6.8 7H8v4h1.2m-1.2-6.7v.35"/></svg>
    </button>
    <span v-show="open" :id="contentId" :class="{ below }" role="tooltip"><slot /></span>
  </span>
</template>

<style scoped>
.quick-help { display:inline-flex; position:relative; flex:0 0 16px; align-self:center; }
.quick-help button { position:relative; display:grid; place-items:center; width:16px; height:16px; min-height:0; padding:0; background:transparent; color:#718078; line-height:1; }
.quick-help button svg { display:block; width:13px; height:13px; }
@media (pointer:coarse) { .quick-help button::after { content:""; position:absolute; inset:-14px -8px -14px -2px; } }
[role=tooltip] { position:absolute; bottom:100%; left:-3.5rem; z-index:5; width:max-content; max-width:min(16rem,65vw); padding:10px 12px; border:1px solid #d3ddd5; border-radius:10px; background:white; color:#243d36; font-weight:400; text-align:left; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
[role=tooltip].below { top:100%; bottom:auto; left:-4.5rem; max-width:min(18rem,calc(100vw - 90px)); }
</style>
