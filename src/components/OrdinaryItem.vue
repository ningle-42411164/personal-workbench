<script setup>
import { nextTick, ref, onBeforeUnmount } from 'vue';
import { renameItem } from '../data/workbenchData.js';

const props = defineProps({
  item: { type: Object, required: true },
  expanded: { type: Boolean, default: false },
  canEdit: { type: Boolean, required: true },
  ellipsis: { type: Boolean, default: false },
  saveItem: { type: Function, required: true },
});
const emit = defineEmits(['expand', 'complete', 'delete', 'editing']);
const editing = ref(false);
const draft = ref('');
const inputControl = ref(null);
const error = ref('');
const saving = ref(false);
let editingBase;

function formatTime(value) {
  const date = new Date(value);
  const clock = [date.getHours(), date.getMinutes(), date.getSeconds()].map(part => String(part).padStart(2, '0')).join(':');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${clock}`;
}
async function beginEdit() {
  draft.value = props.item.title;
  editingBase = JSON.parse(JSON.stringify(props.item));
  emit('editing', props.item.id, editingBase);
  error.value = '';
  editing.value = true;
  await nextTick();
  inputControl.value?.focus();
}
async function saveName() {
  if (saving.value) return;
  const name = draft.value.trim();
  if (!name) { error.value = '请填写事项名称。'; return; }
  // 只改原事项名称，保留分类、创建时间、完成状态和转化关联。
  // 等本机事务提交再退出编辑；编辑期间外部变化由父组件比较原版本，不能悄悄覆盖。
  saving.value = true;
  try {
    if (name === props.item.title || await props.saveItem(renameItem(editingBase, name), editingBase)) { editing.value = false; emit('editing', props.item.id, null); }
    else error.value = '保存未完成，输入保留；请核对是否有其他窗口或云端修改。';
  } finally { saving.value = false; }
}
function cancelName() { if (!saving.value) { editing.value = false; emit('editing', props.item.id, null); } }
onBeforeUnmount(() => emit('editing', props.item.id, null));
</script>

<template>
  <div class="todo-row ordinary-item" :class="{ completed: item.done, 'converted-note': item.convertedToId }">
    <!-- 行本身不绑定完成或展开；各控件独立响应，也保留页面原有的卡片外关闭行为。 -->
    <label class="todo-check">
      <input type="checkbox" :checked="Boolean(item.done)" :disabled="!canEdit || editing" :aria-label="`${item.done ? '恢复' : '完成'} ${item.title}`" @change.stop="emit('complete')">
    </label>
    <button type="button" class="todo-title" :disabled="editing" :aria-expanded="expanded" @click="emit('expand')">
      <span :class="{ 'note-struck': item.convertedToId }">{{ item.title }}</span><span v-for="tag in item.tags" :key="tag" class="project-user-tag">#{{ tag.replace(/^#+/, '') }}</span><span v-if="item.convertedToId" class="recorded-mark">已录入</span><span v-if="ellipsis" class="more-ellipsis" aria-hidden="true">……</span><time v-if="expanded" class="todo-created" :datetime="item.createdAt">（创建于 {{ formatTime(item.createdAt) }}）</time><time v-if="item.done" class="todo-created" :datetime="item.completedAt">（完成于 {{ formatTime(item.completedAt) }}）</time>
    </button>
    <div v-if="item.priority === true || item.urgent" class="todo-status"><span v-if="item.priority === true" class="urgent-mark">优先处理</span><span v-if="item.urgent" class="urgent-mark">急需处理</span></div>
    <div v-if="expanded" class="todo-detail">
      <form v-if="editing" class="ordinary-name-editor" @submit.prevent="saveName">
        <input ref="inputControl" v-model="draft" aria-label="事项名称" maxlength="150" :disabled="!canEdit">
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="form-buttons"><button type="button" class="secondary" :disabled="saving" @click="cancelName">取消</button><button :disabled="!canEdit || saving">保存</button></div>
      </form>
      <template v-else>
        <div class="detail-actions"><button type="button" class="text-button danger delete-button" :disabled="!canEdit" @click="emit('delete')">删除</button><button type="button" class="secondary edit-button" :disabled="!canEdit" @click="beginEdit">编辑</button></div>
        <slot />
      </template>
    </div>
  </div>
</template>
