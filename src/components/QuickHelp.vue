<script setup>
import { onBeforeUnmount, onMounted, ref, useId, watch, nextTick } from 'vue';

const props = defineProps({ label:{type:String,default:'快速记录说明'}, below:Boolean });
const contentId = useId();
const root = ref(null);
const open = ref(false);
const tip = ref(null), placement = ref({});
let touch = false;
// 浮层仍留在当前 dialog 内，按实际边界调整方向与水平偏移，不影响标题/页尾行高。
async function positionTip() {
  if (!open.value) return;
  await nextTick();
  if (!root.value || !tip.value) return;
  const box = root.value.getBoundingClientRect(), bubble = tip.value.getBoundingClientRect();
  const dialog = root.value.closest('dialog');
  const boundary = dialog?.getBoundingClientRect();
  const left = Math.max(8, boundary?.left ?? 8), right = Math.min(innerWidth - 8, boundary?.right ?? innerWidth - 8);
  const top = Math.max(8, boundary?.top ?? 8);
  const below = props.below || box.top - bubble.height - 8 < top;
  placement.value = { left: Math.max(left - box.left, Math.min(-56, right - box.left - bubble.width)) + 'px',
    top: below ? 'calc(100% + 6px)' : 'auto', bottom: below ? 'auto' : 'calc(100% + 6px)' };
}
watch(open, positionTip);

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
  window.addEventListener('resize', positionTip);
  window.addEventListener('scroll', positionTip, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', escape);
  window.removeEventListener('resize', positionTip);
  window.removeEventListener('scroll', positionTip, true);
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
    <span ref="tip" :style="placement" v-show="open" :id="contentId" :class="{ below }" role="tooltip"><slot /></span>
  </span>
</template>

<style scoped>
.quick-help { display:inline-flex; position:relative; flex:0 0 16px; align-self:center; }
.quick-help button { position:relative; display:grid; place-items:center; width:16px; height:16px; min-height:0; padding:0; background:transparent; color:var(--muted-4); line-height:1; }
.quick-help button svg { display:block; width:13px; height:13px; }
@media (pointer:coarse) { .quick-help button::after { content:""; position:absolute; inset:-14px -8px -14px -2px; } }
[role=tooltip] { position:absolute; bottom:100%; left:-3.5rem; z-index:5; width:max-content; max-width:min(16rem,65vw); padding:10px 12px; border:1px solid var(--line-4); border-radius:10px; background:var(--panel-1); color:var(--ink); font-weight:400; text-align:left; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
[role=tooltip].below { top:100%; bottom:auto; left:-4.5rem; max-width:min(18rem,calc(100vw - 90px)); }
</style>
