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
      @click="open = touch ? !open : true">ⓘ</button>
    <span v-show="open" id="quick-record-help" role="tooltip"><slot /></span>
  </span>
</template>

<style scoped>
.quick-help { display:inline-flex; position:relative; align-self:center; }
.quick-help button { width:36px; height:36px; padding:0; background:transparent; color:#486459; font-size:19px; }
[role=tooltip] { position:absolute; bottom:100%; left:-3.5rem; z-index:5; width:max-content; max-width:min(16rem,65vw); padding:8px 12px; border-radius:8px; background:#244d43; color:white; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
</style>
