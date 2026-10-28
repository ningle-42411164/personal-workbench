<script setup>
import { ref } from 'vue';
import ProjectDetail from './ProjectDetail.vue';
import ProjectCard from './ProjectCard.vue';
const props = defineProps({ project: { type: Object, required: true }, canEdit: { type: Boolean, required: true }, saveProject: { type: Function, required: true }, deleteProject: { type: Function, required: true }, availableTags: { type: Array, default: () => [] } });
const emit = defineEmits(['close']);
const detail = ref(null);
const closing = ref(false);
async function saveBeforeLeave() { return !closing.value && await detail.value?.saveBeforeLeave() !== false; }
async function requestClose() {
  if (closing.value) return;
  if (!await saveBeforeLeave()) return;
  closing.value = true;
  emit('close');
}
defineExpose({ saveBeforeLeave });
</script>

<template>
  <ProjectCard title="项目详情" :request-close="requestClose">
      <p id="project-dialog-hint" class="cloud-note">修改后切换字段或关闭会先保存；保存失败时保留输入。点“取消”只放弃当前未提交修改。</p>
      <ProjectDetail ref="detail" :project="props.project" :can-edit="canEdit" :available-tags="availableTags" :save-project="saveProject" :delete-project="deleteProject" @close="requestClose" />

  </ProjectCard>
</template>
