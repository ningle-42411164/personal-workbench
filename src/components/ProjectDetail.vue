<script setup>
import { computed, nextTick, ref } from 'vue';
import { projectEditableFields, updateProject } from '../data/workbenchData.js';
import { normalizeUserTags } from '../data/userTags.js';

const props = defineProps({
  project: { type: Object, required: true },
  canEdit: { type: Boolean, required: true },
  saveProject: { type: Function, required: true },
  deleteProject: { type: Function, required: true },
  availableTags: { type: Array, default: () => [] },
});
const emit = defineEmits(['close']);
const editingField = ref(null);
const draft = ref('');
const inputControl = ref(null);
const showAllUpdates = ref(false);
const error = ref('');
const fields = [
  { key: 'title', label: '项目名称', input: 'text' },
  { key: 'currentSituation', label: '当前情况', input: 'textarea' },
  { key: 'nextStep', label: '下一步', input: 'textarea' },
  { key: 'status', label: '状态', input: 'status' },
  { key: 'tags', label: '用户标签', input: 'tags' },
  { key: 'startDate', label: '开始日期', input: 'date' },
  { key: 'dueDate', label: '预计截止日期', input: 'date' },
];
const history = computed(() => [...(props.project.updates ?? [])].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
const visibleHistory = computed(() => showAllUpdates.value ? history.value : history.value.slice(0, 1));
const tagOptions = computed(() => normalizeUserTags([...props.availableTags, ...props.project.tags]));
const statusOptions = [{ value: 'active', label: '进行中' }, { value: 'paused', label: '暂停中' }, { value: 'done', label: '已完成' }];

async function beginEdit(field) {
  const value = projectEditableFields(props.project)[field.key];
  draft.value = field.key === 'tags' ? normalizeUserTags(value) : value ?? '';
  editingField.value = field.key;
  error.value = '';
  await nextTick();
  // 控件显示之后再聚焦，桌面和手机采用同一套单击编辑流程。
  inputControl.value?.focus();
}
function cancelEdit() {
  editingField.value = null;
  draft.value = '';
  error.value = '';
}
function saveChange(change) {
  try {
    if (change.status === 'done' && props.project.status !== 'done' &&
        !window.confirm(`确定将项目“${props.project.title}”标记为完成吗？`)) return false;
    const next = updateProject(props.project, change);
    return next === props.project || props.saveProject(next);
  } catch (cause) {
    error.value = cause.message;
    return false;
  }
}
function saveField() {
  if (saveChange({ [editingField.value]: draft.value })) cancelEdit();
}
function displayValue(key) {
  const value = projectEditableFields(props.project)[key];
  if (key === 'status') return value ? statusOptions.find(option => option.value === value)?.label : '未设置';
  if (key === 'tags') return value.length ? value.map(tag => `#${tag.replace(/^#+/, '')}`).join(' ') : '未填写';
  return value || '未填写';
}
function formatTime(value) {
  const date = new Date(value);
  const clock = [date.getHours(), date.getMinutes(), date.getSeconds()].map(part => String(part).padStart(2, '0')).join(':');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${clock}`;
}
</script>

<template>
  <div class="project-detail" @click.stop>
    <div class="project-fields">
      <div v-for="field in fields" :key="field.key" class="project-field-row">
        <button type="button" class="project-field-label" :disabled="!canEdit" :aria-expanded="editingField === field.key" @click="beginEdit(field)">{{ field.label }}</button>
        <button v-if="field.key === 'title'" type="button" class="project-close" aria-label="关闭项目详情" @click="emit('close')">×</button>
        <form v-if="editingField === field.key" class="project-field-editor project-edit" @submit.prevent="saveField">
          <input v-if="field.input === 'text' || field.input === 'date'" :ref="el => inputControl = el" v-model="draft" :type="field.input" :maxlength="field.key === 'title' ? 150 : undefined" :aria-label="field.label" :disabled="!canEdit">
          <textarea v-else-if="field.input === 'textarea'" :ref="el => inputControl = el" v-model="draft" :aria-label="field.label" rows="3" :disabled="!canEdit"></textarea>
          <div v-else-if="field.input === 'status'" class="project-choice-list" role="group" aria-label="状态选项">
            <label v-for="(option, index) in statusOptions" :key="option.value"><input :ref="el => { if (index === 0) inputControl = el; }" v-model="draft" type="radio" :name="`project-status-${project.id}`" :value="option.value" :disabled="!canEdit">{{ option.label }}</label>
          </div>
          <div v-else class="project-choice-list" role="group" aria-label="用户标签选项">
            <p v-if="!tagOptions.length" class="empty">当前没有已保存的用户标签。</p>
            <label v-for="(tag, index) in tagOptions" :key="tag"><input :ref="el => { if (index === 0) inputControl = el; }" v-model="draft" type="checkbox" :value="tag" :disabled="!canEdit">#{{ tag.replace(/^#+/, '') }}</label>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="form-buttons"><button type="button" class="secondary" @click="cancelEdit">取消</button><button :disabled="!canEdit">保存</button></div>
        </form>
        <button v-else type="button" class="project-field-value" :disabled="!canEdit" :aria-label="`编辑${field.label}`" @click="beginEdit(field)">{{ displayValue(field.key) }}<time v-if="field.key === 'status' && project.completedAt" :datetime="project.completedAt">（完成于 {{ formatTime(project.completedAt) }}）</time></button>
      </div>
    </div>
      <div class="project-history">
        <h3>更新记录 <small>{{ history.length }}</small></h3>
        <p v-if="!history.length" class="empty">还没有更新记录。</p>
        <ol v-else><li v-for="record in visibleHistory" :key="record.id">{{ record.content || '当前情况已清空' }}<time :datetime="record.createdAt">（{{ formatTime(record.createdAt) }}）</time></li></ol>
        <button v-if="history.length > 1" type="button" class="text-button" :aria-expanded="showAllUpdates" @click="showAllUpdates = !showAllUpdates">{{ showAllUpdates ? '收起' : '查看更多' }}</button>
      </div>
      <div class="form-buttons"><button type="button" class="text-button danger delete-button" :disabled="!canEdit" @click="deleteProject(project.id)">删除</button><button v-if="project.status !== 'done'" type="button" :disabled="!canEdit" @click="saveChange({ status: 'done' })">标记完成</button></div>
  </div>
</template>
