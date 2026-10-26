<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import ProjectDetail from './ProjectDetail.vue';
const props = defineProps({ project: { type: Object, required: true }, canEdit: { type: Boolean, required: true }, saveProject: { type: Function, required: true }, deleteProject: { type: Function, required: true }, availableTags: { type: Array, default: () => [] } });
const emit = defineEmits(['close']);
const dialog = ref(null);
const detail = ref(null);
const closing = ref(false);
let previousFocus;
let previousOverflow;
let pointerStartedOutside = false;
async function saveBeforeLeave() { return !closing.value && await detail.value?.saveBeforeLeave() !== false; }
async function requestClose() {
  if (closing.value) return;
  if (!await saveBeforeLeave()) return;
  closing.value = true;
  dialog.value?.close();
  emit('close');
}
function outside(event) {
  if (event.target !== dialog.value) return false;
  const rect = dialog.value.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}
function pointerDown(event) { pointerStartedOutside = outside(event); }
function backdropClick(event) {
  // 在卡内选择文字后拖到遮罩释放，不算一次遮罩关闭。
  if (pointerStartedOutside && outside(event)) void requestClose();
  pointerStartedOutside = false;
}
onMounted(async () => {
  previousFocus = document.activeElement;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.value.showModal();
  await nextTick();
  dialog.value.querySelector('.project-dialog-title')?.focus();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
  if (previousFocus?.isConnected) previousFocus.focus();
  else document.querySelector('.project-section .category-expand')?.focus();
});
defineExpose({ saveBeforeLeave });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="project-dialog" aria-labelledby="project-dialog-title" aria-describedby="project-dialog-hint" @cancel.prevent="requestClose" @pointerdown="pointerDown" @click="backdropClick">
      <div class="project-dialog-head"><h2 id="project-dialog-title" class="project-dialog-title" tabindex="-1">项目详情</h2><button type="button" class="project-close" aria-label="关闭项目详情" :disabled="closing" @click="requestClose">×</button></div>
      <p id="project-dialog-hint" class="cloud-note">修改后切换字段或关闭会先保存；保存失败时保留输入。点“取消”只放弃当前未提交修改。</p>
      <ProjectDetail ref="detail" :project="props.project" :can-edit="canEdit" :available-tags="availableTags" :save-project="saveProject" :delete-project="deleteProject" @close="requestClose" />
    </dialog>
  </Teleport>
</template>
