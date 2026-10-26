<script setup>
import { computed, nextTick, reactive, ref, toRef } from 'vue';
import { projectEditableFields } from '../data/workbenchData.js';
import { normalizeUserTags } from '../data/userTags.js';
import { createProjectEditor } from '../data/projectEditor.js';

// 详情读取父组件的项目；编辑先放进 draft，保存成功后由父组件替换项目，props 随之更新。
const props = defineProps({
  project: { type: Object, required: true },
  canEdit: { type: Boolean, required: true },
  saveProject: { type: Function, required: true },
  deleteProject: { type: Function, required: true },
  availableTags: { type: Array, default: () => [] },
});
const emit = defineEmits(['close']);
// 只编辑一个字段；切换或关闭先保存，失败保留字段和输入，只有主动取消才放弃。
const editing = reactive({ field: null, draft: '', error: '', busy: false });
const editingField = toRef(editing, 'field');
const draft = toRef(editing, 'draft');
const inputControl = ref(null);
const showAllUpdates = ref(false);
const error = toRef(editing, 'error');
const editor = createProjectEditor({
  state: editing, getProject: () => props.project, canEdit: () => props.canEdit,
  async saveProject(next) {
    const saved = await props.saveProject(next);
    // 等父组件的新项目传回 props，再允许完成等后续操作，避免用旧值覆盖刚保存的字段。
    if (saved) await nextTick();
    return saved;
  },
  confirmComplete: project => window.confirm(`确定将项目“${project.title}”标记为完成吗？`),
});
const fields = [
  { key: 'title', label: '项目名称', input: 'text' },
  { key: 'currentSituation', label: '当前情况', input: 'textarea' },
  { key: 'nextStep', label: '下一步', input: 'textarea' },
  { key: 'status', label: '状态', input: 'status' },
  { key: 'tags', label: '用户标签', input: 'tags' },
  { key: 'startDate', label: '开始日期', input: 'date' },
  { key: 'dueDate', label: '预计截止日期', input: 'date' },
];
// 先复制再倒序/排序，不改变原始历史；时间相同时 reverse 让最后追加的记录显示在前。
const history = computed(() => [...(props.project.updates ?? [])].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
const visibleHistory = computed(() => showAllUpdates.value ? history.value : history.value.slice(0, 1));
// 选项与已选值是两回事；合并选项不等于给项目自动选标签，真正选择只写入 draft。
const tagOptions = computed(() => normalizeUserTags([...props.availableTags, ...props.project.tags]));
const statusOptions = [{ value: 'active', label: '进行中' }, { value: 'paused', label: '暂停中' }, { value: 'done', label: '已完成' }];

async function beginEdit(field) {
  if (!await editor.begin(field.key)) return;
  await nextTick();
  // 控件显示之后再聚焦，桌面和手机采用同一套单击编辑流程。
  inputControl.value?.focus();
}
function cancelEdit() {
  editor.cancel();
}
function saveField() {
  // editor 用当前字段名生成局部更新；沿用 updateProject 的变化和历史语义。
  return editor.commit();
}
async function completeProject() { if (await editor.complete()) emit('close'); }
async function removeProject() {
  if (!await editor.commit()) return;
  if (await props.deleteProject(props.project.id)) emit('close');
}
defineExpose({ saveBeforeLeave: editor.commit });
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
  <!-- 详情内部点击不触发外壳遮罩关闭；所有关闭请求交给外壳先保存再离开。 -->
  <div class="project-detail" @click.stop>
    <div class="project-fields">
      <div v-for="field in fields" :key="field.key" class="project-field-row">
        <button type="button" class="project-field-label" :disabled="!canEdit || editing.busy" :aria-expanded="editingField === field.key" @click="beginEdit(field)">{{ field.label }}</button>
        <form v-if="editingField === field.key" class="project-field-editor project-edit" @submit.prevent="saveField">
          <input v-if="field.input === 'text' || field.input === 'date'" :ref="el => inputControl = el" v-model="draft" :type="field.input" :maxlength="field.key === 'title' ? 150 : undefined" :aria-label="field.label" :disabled="!canEdit || editing.busy">
          <textarea v-else-if="field.input === 'textarea'" :ref="el => inputControl = el" v-model="draft" :aria-label="field.label" rows="3" :disabled="!canEdit || editing.busy"></textarea>
          <div v-else-if="field.input === 'status'" class="project-choice-list" role="group" aria-label="状态选项">
            <label v-for="(option, index) in statusOptions" :key="option.value"><input :ref="el => { if (index === 0) inputControl = el; }" v-model="draft" type="radio" :name="`project-status-${project.id}`" :value="option.value" :disabled="!canEdit || editing.busy">{{ option.label }}</label>
          </div>
          <div v-else class="project-choice-list" role="group" aria-label="用户标签选项">
            <p v-if="!tagOptions.length" class="empty">当前没有已保存的用户标签。</p>
            <label v-for="(tag, index) in tagOptions" :key="tag"><input :ref="el => { if (index === 0) inputControl = el; }" v-model="draft" type="checkbox" :value="tag" :disabled="!canEdit || editing.busy">#{{ tag.replace(/^#+/, '') }}</label>
          </div>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="form-buttons"><button type="button" class="secondary" :disabled="editing.busy" @click="cancelEdit">取消</button><button :disabled="!canEdit || editing.busy">{{ editing.busy ? '正在保存…' : '保存' }}</button></div>
        </form>
        <button v-else type="button" class="project-field-value" :disabled="!canEdit || editing.busy" :aria-label="`编辑${field.label}`" @click="beginEdit(field)">{{ displayValue(field.key) }}<time v-if="field.key === 'status' && project.completedAt" :datetime="project.completedAt">（完成于 {{ formatTime(project.completedAt) }}）</time></button>
      </div>
    </div>
      <div class="project-history">
        <h3>更新记录 <small>{{ history.length }}</small></h3>
        <p v-if="!history.length" class="empty">还没有更新记录。</p>
        <ol v-else><li v-for="record in visibleHistory" :key="record.id">{{ record.content || '当前情况已清空' }}<time :datetime="record.createdAt">（{{ formatTime(record.createdAt) }}）</time></li></ol>
        <button v-if="history.length > 1" type="button" class="text-button" :aria-expanded="showAllUpdates" @click="showAllUpdates = !showAllUpdates">{{ showAllUpdates ? '收起' : '查看更多' }}</button>
      </div>
      <p v-if="error && !editingField" class="error" role="alert">{{ error }}</p>
      <div class="form-buttons"><button type="button" class="text-button danger delete-button" :disabled="!canEdit || editing.busy" @click="removeProject">删除</button><button v-if="project.status !== 'done'" type="button" :disabled="!canEdit || editing.busy" @click="completeProject">标记完成</button></div>
  </div>
</template>
