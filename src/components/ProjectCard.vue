<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
defineProps({ title: String, requestClose: Function });
const dialog = ref(null);
let previous, overflow, outside = false;
function isOutside(event) {
  const r = dialog.value.getBoundingClientRect();
  return event.target === dialog.value && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
}
function viewport() {
  const v = window.visualViewport;
  dialog.value?.style.setProperty('--card-height', `${v?.height ?? window.innerHeight}px`);
  dialog.value?.style.setProperty('--card-top', `${(v?.offsetTop ?? 0) + (v?.height ?? window.innerHeight) / 2}px`);
}
onMounted(() => {
  previous = document.activeElement; overflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden'; viewport(); dialog.value.showModal();
  dialog.value.querySelector('h2').focus();
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
});
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', viewport);
  window.visualViewport?.removeEventListener('scroll', viewport);
  dialog.value?.close(); document.body.style.overflow = overflow;
  if (previous?.isConnected) previous.focus();
});
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="project-dialog" :aria-label="title" @cancel.prevent="requestClose" @pointerdown="outside = isOutside($event)" @click="if (outside && isOutside($event)) requestClose(); outside = false">
      <header class="project-dialog-head"><h2 class="project-dialog-title" tabindex="-1">{{ title }}</h2><button type="button" class="project-close" :aria-label="`关闭${title}`" @click="requestClose">×</button></header>
      <div class="project-dialog-body"><slot /></div>
    </dialog>
  </Teleport>
</template>
