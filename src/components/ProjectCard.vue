<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { markDialogOpened, lockDialogPage, unlockDialogPage } from '../data/effectHost.js';
const props = defineProps({ title: String, requestClose: Function, open: { type:Boolean, default:true } });
const dialog = ref(null);
let previous, outside = false;
function isOutside(event) {
  const r = dialog.value.getBoundingClientRect();
  return event.target === dialog.value && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
}
function viewport() {
  const v = window.visualViewport;
  dialog.value?.style.setProperty('--card-height', `${v?.height ?? window.innerHeight}px`);
  dialog.value?.style.setProperty('--card-top', `${(v?.offsetTop ?? 0) + (v?.height ?? window.innerHeight) / 2}px`);
}
function openCard() {
  if (!dialog.value || dialog.value.open) return;
  previous = document.activeElement;
  lockDialogPage(document,dialog.value); viewport(); markDialogOpened(dialog.value); dialog.value.showModal();
  dialog.value.querySelector('h2').focus();
}
function closeCard() {
  if (!dialog.value?.open) return;
  dialog.value.close(); unlockDialogPage(document,dialog.value,previous);
}
watch(() => props.open, open => open ? openCard() : closeCard(), {flush:'post'});
onMounted(() => {
  if (props.open) openCard();
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
});
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', viewport);
  window.visualViewport?.removeEventListener('scroll', viewport);
  closeCard();
});
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="project-dialog" :aria-label="title" @cancel.prevent="requestClose" @pointerdown="outside = isOutside($event)" @click="if (outside && isOutside($event)) requestClose(); outside = false">
      <header class="project-dialog-head"><h2 class="project-dialog-title" tabindex="-1">{{ title }} <slot name="hint" /></h2><button type="button" class="project-close" :aria-label="`关闭${title}`" @click="requestClose">×</button></header>
      <div class="project-dialog-body"><slot /></div>
    </dialog>
  </Teleport>
</template>
