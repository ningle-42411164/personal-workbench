<script setup>
import { computed, ref } from 'vue';
import { parseProjectTags, projectEditableFields, updateProject } from '../data/workbenchData.js';

const props = defineProps({
  project: { type: Object, required: true },
  canEdit: { type: Boolean, required: true },
  saveProject: { type: Function, required: true },
  deleteProject: { type: Function, required: true },
});
const emit = defineEmits(['close']);
const editing = ref(false);
const draft = ref(null);
const tagsText = ref('');
const showAllUpdates = ref(false);
const error = ref('');
const history = computed(() => [...(props.project.updates ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
const visibleHistory = computed(() => showAllUpdates.value ? history.value : history.value.slice(0, 1));
const statusText = computed(() => ({ active: '进行中', paused: '暂停中', done: '已完成' })[props.project.status ?? 'active']);

function beginEdit() {
  const fields = projectEditableFields(props.project);
  draft.value = { ...fields, startDate: fields.startDate ?? '', dueDate: fields.dueDate ?? '' };
  tagsText.value = fields.tags.map(tag => `#${tag.replace(/^#+/, '')}`).join(' ');
  error.value = '';
  editing.value = true;
}
function cancelEdit() {
  editing.value = false;
  draft.value = null;
  error.value = '';
}
function saveEdit() {
  try {
    const next = updateProject(props.project, { ...draft.value, tags: parseProjectTags(tagsText.value) });
    if (next === props.project || props.saveProject(next)) cancelEdit();
  } catch (cause) {
    error.value = cause.message;
  }
}
function finishProject() {
  if (!window.confirm(`确定将项目“${props.project.title}”标记为完成吗？`)) return;
  const next = updateProject(props.project, { ...projectEditableFields(props.project), status: 'done' });
  props.saveProject(next);
}
</script>

<template>
  <div class="project-detail">
    <form v-if="editing" class="project-edit" @submit.prevent="saveEdit">
      <label>项目名称<input v-model="draft.title" maxlength="150" :disabled="!canEdit" required></label>
      <label>状态<select v-model="draft.status" :disabled="!canEdit"><option value="active">进行中</option><option value="paused">暂停中</option><option value="done">已完成</option></select></label>
      <label>用户标签 <span class="project-field-hint">用空格或逗号分隔</span><input v-model="tagsText" :disabled="!canEdit" placeholder="#代码 #学习"></label>
      <div class="project-date-fields">
        <label>开始日期<input v-model="draft.startDate" type="date" :disabled="!canEdit"></label>
        <label>预计截止日期<input v-model="draft.dueDate" type="date" :disabled="!canEdit"></label>
      </div>
      <label>当前情况<textarea v-model="draft.currentSituation" :disabled="!canEdit" rows="3" placeholder="最近进展"></textarea></label>
      <label>下一步<textarea v-model="draft.nextStep" :disabled="!canEdit" rows="3" placeholder="接下来要做什么"></textarea></label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="form-buttons"><button type="button" class="text-button danger delete-button" :disabled="!canEdit" @click="deleteProject(project.id)">删除</button><button type="button" class="secondary" @click="cancelEdit">取消</button><button :disabled="!canEdit">保存</button></div>
    </form>
    <template v-else>
      <div class="project-fields">
        <p><strong>项目名称</strong><span>{{ project.title }}</span></p>
        <p><strong>状态</strong><span>{{ statusText }}<time v-if="project.completedAt" :datetime="project.completedAt"> · 完成于 {{ new Date(project.completedAt).toLocaleString() }}</time></span></p>
        <p><strong>用户标签</strong><span>{{ project.tags.length ? project.tags.map(tag => `#${tag.replace(/^#+/, '')}`).join(' ') : '未填写' }}</span></p>
        <p><strong>开始日期</strong><span>{{ project.startDate || '未填写' }}</span></p>
        <p><strong>预计截止日期</strong><span>{{ project.dueDate || '未填写' }}</span></p>
        <p><strong>当前情况</strong><span>{{ project.currentSituation || '未填写' }}</span></p>
        <p><strong>下一步</strong><span>{{ project.nextStep || '未填写' }}</span></p>
      </div>
      <div class="project-history">
        <h3>更新记录 <small>{{ history.length }}</small></h3>
        <p v-if="!history.length" class="empty">还没有更新记录。</p>
        <ol v-else><li v-for="record in visibleHistory" :key="record.id"><time :datetime="record.createdAt">{{ new Date(record.createdAt).toLocaleString() }}</time><p>{{ record.content || '（当前情况已清空）' }}</p></li></ol>
        <button v-if="history.length > 1" type="button" class="text-button" :aria-expanded="showAllUpdates" @click="showAllUpdates = !showAllUpdates">{{ showAllUpdates ? '收起' : '查看更多' }}</button>
      </div>
      <div class="form-buttons"><button type="button" class="text-button danger delete-button" :disabled="!canEdit" @click="deleteProject(project.id)">删除</button><button v-if="project.status !== 'done'" type="button" class="secondary" :disabled="!canEdit" @click="finishProject">标记完成</button><button type="button" class="secondary" @click="emit('close')">关闭</button><button type="button" :disabled="!canEdit" @click="beginEdit">编辑项目</button></div>
    </template>
  </div>
</template>
