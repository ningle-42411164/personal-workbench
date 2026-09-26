<script setup>
import { ref } from 'vue';
import { createProject } from '../data/workbenchData.js';

const props = defineProps({
  canEdit: { type: Boolean, required: true },
  availableTags: { type: Array, default: () => [] },
  saveProject: { type: Function, required: true },
});
const emit = defineEmits(['close']);
const draft = ref({ title: '', status: '', tags: [], startDate: '', dueDate: '', currentSituation: '', nextStep: '' });
const error = ref('');
function save() {
  try {
    const { title, ...fields } = draft.value;
    if (props.saveProject(createProject(title, fields))) emit('close');
  } catch (cause) {
    error.value = cause.message;
  }
}
</script>

<template>
  <form class="category-add-form project-edit" @submit.prevent="save">
    <label>项目名称<input v-model="draft.title" maxlength="150" :disabled="!canEdit"></label>
    <label>当前情况<textarea v-model="draft.currentSituation" rows="3" :disabled="!canEdit"></textarea></label>
    <label>下一步<textarea v-model="draft.nextStep" rows="3" :disabled="!canEdit"></textarea></label>
    <label>状态<select v-model="draft.status" :disabled="!canEdit"><option value="" disabled hidden>选择状态（可留空）</option><option value="active">进行中</option><option value="paused">暂停中</option><option value="done">已完成</option></select></label>
    <fieldset class="project-tag-picker"><legend>用户标签</legend><p v-if="!availableTags.length" class="empty">当前没有已保存的用户标签。</p><div class="project-choice-list"><label v-for="tag in availableTags" :key="tag"><input v-model="draft.tags" type="checkbox" :value="tag" :disabled="!canEdit">#{{ tag.replace(/^#+/, '') }}</label></div></fieldset>
    <div class="project-date-fields"><label>开始日期<input v-model="draft.startDate" type="date" :disabled="!canEdit"></label><label>预计截止日期<input v-model="draft.dueDate" type="date" :disabled="!canEdit"></label></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="form-buttons"><button type="button" class="secondary" @click="emit('close')">取消</button><button :disabled="!canEdit">保存</button></div>
  </form>
</template>
