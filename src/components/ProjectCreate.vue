<script setup>
import { ref } from 'vue';
import ProjectCard from './ProjectCard.vue';
import { createProject } from '../data/workbenchData.js';

const props = defineProps({
  canEdit: { type: Boolean, required: true },
  availableTags: { type: Array, default: () => [] },
  saveProject: { type: Function, required: true },
});
const emit = defineEmits(['close']);
// 整份创建草稿是独立对象；有输入时关闭先确认放弃，保存成功才成为正式项目。
const draft = ref({ title: '', status: '', tags: [], startDate: '', dueDate: '', currentSituation: '', nextStep: '' });
const error = ref('');
const saving = ref(false);
function requestClose() {
  if (saving.value) return;
  const changed = Object.values(draft.value).some(value => Array.isArray(value) ? value.length : value !== '');
  if (!changed || window.confirm('放弃尚未保存的新项目内容？')) emit('close');
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    // 名称与其他字段一起交给共用工厂，快速创建也使用它，避免空名称规则和创建记录各写一套。
    const { title, ...fields } = draft.value;
    // 事务保存是异步的；收到成功结果后才关闭，不能把 Promise 当作 true。
    if (await props.saveProject(createProject(title, fields))) emit('close');
    else error.value = '创建未成功，输入已保留，请重试。';
  } catch (cause) {
    error.value = cause.message;
  } finally { saving.value = false; }
}
</script>

<template>
  <ProjectCard title="新增项目" :request-close="requestClose">
  <form class="category-add-form project-edit" @submit.prevent="save">
    <label>项目名称<input v-model="draft.title" maxlength="150" :disabled="!canEdit"></label>
    <label>当前情况<textarea v-model="draft.currentSituation" rows="3" :disabled="!canEdit"></textarea></label>
    <label>下一步<textarea v-model="draft.nextStep" rows="3" :disabled="!canEdit"></textarea></label>
    <label>状态<select v-model="draft.status" :disabled="!canEdit"><option value="" disabled hidden>选择状态（可留空）</option><option value="active">进行中</option><option value="paused">暂停中</option><option value="done">已完成</option></select></label>
    <fieldset class="project-tag-picker"><legend>用户标签</legend><p v-if="!availableTags.length" class="empty">当前没有已保存的用户标签。</p><div class="project-choice-list"><label v-for="tag in availableTags" :key="tag"><input v-model="draft.tags" type="checkbox" :value="tag" :disabled="!canEdit">#{{ tag.replace(/^#+/, '') }}</label></div></fieldset>
    <div class="project-date-fields"><label>开始日期<input v-model="draft.startDate" type="date" :disabled="!canEdit"></label><label>预计截止日期<input v-model="draft.dueDate" type="date" :disabled="!canEdit"></label></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="form-buttons"><button type="button" class="secondary" :disabled="saving" @click="requestClose">取消</button><button :disabled="!canEdit || saving">保存</button></div>
  </form>
  </ProjectCard>
</template>
