<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import LaunchSplash from './components/LaunchSplash.vue';
import ProjectDetail from './components/ProjectDetail.vue';
import ProjectCreate from './components/ProjectCreate.vue';
import OrdinaryItem from './components/OrdinaryItem.vue';
import { availableUserTags } from './data/userTags.js';
import { COMPLETABLE_TYPES, comparePriorityThenNewest, convertNote, createImportantDate, createNote, createRoutine, createSimpleItem, createTodo, daysUntil, emptyWorkbenchData, isCalendarDate, readWorkbenchData, removeItem, renameItem, toggleTodo, validateWorkbenchData, writeWorkbenchData } from './data/workbenchData.js';

const workbenchData = ref(emptyWorkbenchData());
const tasks = computed(() => workbenchData.value.items.filter(item => item.type === 'todo'));
const title = ref('');//保存输入框当前的文字。
const urgent = ref(false);//保存“急需处理”复选框是否勾选。
const message = ref('');//保存需要展示给用户的错误提示
const needProcessing = ref(false);
const showMoreOptions = ref(false);
const quickType = ref('default');
const quickTargetDate = ref('');
const quickTypes = [
  { type: 'todo', label: '一次性待办' }, { type: 'importantDate', label: '重要日' },
  { type: 'project', label: '项目' }, { type: 'shopping', label: '购物' },
  { type: 'waiting', label: '等待中' }, { type: 'creation', label: '娱乐/创作' },
];
const routineTitle = ref('');
const showRoutineForm = ref(false);
const editingRoutineId = ref(null);
const importantTitle = ref('');
const importantTargetDate = ref('');
const showImportantForm = ref(false);
const categories = [
  { type: 'note', label: '随笔' },
  { type: 'waiting', label: '等待中' },
  { type: 'creation', label: '娱乐/创作' },
  { type: 'shopping', label: '购物' },
];
const expandedCategories = ref({ note: false, waiting: false, creation: false, shopping: false });
const addingCategory = ref(null);
const categoryTitle = ref('');
const selectedNoteId = ref(null);
const conversionType = ref('todo');
const conversionDate = ref('');
const selectedTodoId = ref(null);
const selectedDetailId = ref(null);
const selectedProjectId = ref(null);
const showCompleted = ref(false);
const showProjects = ref(true);
const showOpenTodos = ref(true);
const today = ref(new Date());
const pendingImport = ref(null);
const pendingFileName = ref('');
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();

// 浏览器保存的数据需要先校验，读取失败时不能悄悄覆盖旧数据。
const storageReadable = ref(true);
try {
  workbenchData.value = readWorkbenchData();//正常情况下才会执行这个
} catch (error) {
  storageReadable.value = false;
  message.value = error.message;
}

const routines = computed(() => workbenchData.value.items.filter(item => item.type === 'routine'));
const importantDates = computed(() => workbenchData.value.items.filter(item => item.type === 'importantDate').sort(comparePriorityThenNewest));
const openTodos = computed(() => tasks.value.filter(task => !task.done).sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt)));
const completedTodos = computed(() => workbenchData.value.items.filter(item => COMPLETABLE_TYPES.includes(item.type) && item.done).sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
const projects = computed(() => workbenchData.value.items.filter(item => item.type === 'project' && item.status !== 'done').sort(comparePriorityThenNewest));
const completedProjects = computed(() => workbenchData.value.items.filter(item => item.type === 'project' && item.status === 'done').sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
const completedCount = computed(() => completedTodos.value.length + completedProjects.value.length);
const visibleProjects = computed(() => showProjects.value ? projects.value : projects.value.slice(0, 2));
const visibleOpenTodos = computed(() => showOpenTodos.value ? openTodos.value : openTodos.value.slice(0, 2));
const availableProjectTags = computed(() => availableUserTags(workbenchData.value.items));
function categoryItems(type) {
  return workbenchData.value.items.filter(item => item.type === type && !item.done).sort((a, b) =>
    type === 'note' ? Number(Boolean(a.convertedToId)) - Number(Boolean(b.convertedToId)) || b.createdAt.localeCompare(a.createdAt)
      : comparePriorityThenNewest(a, b));
}
function visibleCategoryItems(type) {
  const items = categoryItems(type);
  return expandedCategories.value[type] ? items : items.slice(0, 2);
}

let midnightTimer;
function refreshToday() {
  clearTimeout(midnightTimer);
  today.value = new Date();
  const now = today.value;
  midnightTimer = setTimeout(refreshToday, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 100);
}
onMounted(() => {
  refreshToday();
  document.addEventListener('visibilitychange', refreshToday);
  document.addEventListener('click', closeProjectFromOutside);
});
onBeforeUnmount(() => {
  clearTimeout(midnightTimer);
  document.removeEventListener('visibilitychange', refreshToday);
  document.removeEventListener('click', closeProjectFromOutside);
});

function closeProjectFromOutside(event) {
  if (!event.target.closest('.project-detail, .project-list-trigger')) selectedProjectId.value = null;
}

function toggleProjectDetails(id) {
  selectedProjectId.value = selectedProjectId.value === id ? null : id;
}

function createFullProject(project) {
  return saveTasks([...workbenchData.value.items, project]);
}

function countdownText(targetDate) {
  const days = daysUntil(targetDate, today.value);
  return days > 0 ? `还有 ${days} 天` : days < 0 ? `已过 ${-days} 天` : '就是今天';
}

// 先确认保存成功，再更新页面，避免出现“看似保存但实际丢失”。
//这个saveTasks起保存数据到浏览器上面的功能（顺带同步vue数据库）
function saveTasks(nextTasks) {//nextTasks是这个函数接收的参数
  if (!storageReadable.value) return false;
  try {
    const nextData = { ...workbenchData.value, items: nextTasks };
    writeWorkbenchData(nextData);//把完整的 2.0 数据保存到浏览器上面
    workbenchData.value = nextData;//保存成功后再更新页面
    message.value = '';
    return true;
  } catch {
    message.value = '保存失败，请检查浏览器是否允许本地存储。';
    return false;
  }
}

// 学习笔记（第一步的写法）：
//创建新任务task后，把新任务和旧任务（...tasks.value）一起丢给saveTasks保存到浏览器
// 2.0 现在把各种类型的事项放在同一个 items 数组中。
function addTask() {
  if (quickType.value !== 'project' && !title.value.trim()) { message.value = '请先填写记录内容。'; return; }//非空字符串在 JS 里算 true,trim()删掉了title.value两端的空格之后，再！判断是否ture
  if (quickType.value === 'importantDate' && !isCalendarDate(quickTargetDate.value)) {
    message.value = '请先选择有效的目标日期。'; return;
  }
  const now = new Date().toISOString();
  const item = quickType.value === 'default'
    ? (needProcessing.value ? createTodo(title.value.trim(), urgent.value, now) : createNote(title.value.trim(), now))
    : quickType.value === 'todo'
      ? { ...createTodo(title.value.trim(), false, now), priority: needProcessing.value }
    : quickType.value === 'importantDate'
      ? createImportantDate(title.value.trim(), quickTargetDate.value, now, needProcessing.value)
      : createSimpleItem(quickType.value, title.value.trim(), now, needProcessing.value);
  if (saveTasks([...workbenchData.value.items, item])) {
    title.value = '';
    needProcessing.value = false;
    urgent.value = false;
    quickType.value = 'default';
    quickTargetDate.value = '';
    showMoreOptions.value = false;
  }//把旧，新任务丢上浏览器保存后清空输入框
}

function toggleMoreOptions() {
  showMoreOptions.value = !showMoreOptions.value;
  if (!showMoreOptions.value) {
    quickType.value = 'default';
    quickTargetDate.value = '';
    needProcessing.value = false;
    urgent.value = false;
  }
}

function onQuickTypeChange() {
  needProcessing.value = false;
  urgent.value = false;
}

function openCategoryForm(type) {
  addingCategory.value = addingCategory.value === type ? null : type;
  categoryTitle.value = '';
}

function addCategoryItem() {
  if (!categoryTitle.value.trim()) { message.value = '请先填写内容。'; return; }
  const item = addingCategory.value === 'note'
    ? createNote(categoryTitle.value.trim()) : addingCategory.value === 'todo'
      ? createTodo(categoryTitle.value.trim(), false) : createSimpleItem(addingCategory.value, categoryTitle.value.trim());
  if (saveTasks([...workbenchData.value.items, item])) {
    categoryTitle.value = '';
    addingCategory.value = null;
  }
}

function openNoteDetails(item) {
  selectedNoteId.value = selectedNoteId.value === item.id ? null : item.id;
  conversionType.value = 'todo';
  conversionDate.value = '';
}

function saveNoteConversion() {
  try {
    const nextItems = convertNote(workbenchData.value.items, selectedNoteId.value, conversionType.value, conversionDate.value);
    if (saveTasks(nextItems)) selectedNoteId.value = null;
  } catch (error) {
    message.value = error.message;
  }
}

//切换完成状态，id 是操作目标传进来的参数
function toggleTask(id) {
  saveTasks(workbenchData.value.items.map(item => item.id === id && COMPLETABLE_TYPES.includes(item.type) ? toggleTodo(item) : item));
}
// { ...task }展开task属性；完成状态与完成时间一起改变。

function saveOrdinaryItem(nextItem) {
  return saveTasks(workbenchData.value.items.map(item => item.id === nextItem.id ? nextItem : item));
}

// 项目详情只负责生成新记录；沿用页面的“先写入、后更新”保存顺序。
function saveProject(nextProject) {
  const previous = workbenchData.value.items.find(item => item.id === nextProject.id && item.type === 'project');
  if (!previous || !saveTasks(workbenchData.value.items.map(item => item.id === nextProject.id ? nextProject : item))) return false;
  if ((previous.status === 'done') !== (nextProject.status === 'done')) selectedProjectId.value = null;
  return true;
}

function openRoutineForm(item = null) {
  editingRoutineId.value = item?.id ?? null;
  routineTitle.value = item?.title ?? '';
  showRoutineForm.value = true;
}

function closeRoutineForm() {
  showRoutineForm.value = false;
  editingRoutineId.value = null;
  routineTitle.value = '';
}

function saveRoutine() {
  if (!routineTitle.value.trim()) { message.value = '请先填写日常持续事项。'; return; }
  const nextItems = editingRoutineId.value
    ? workbenchData.value.items.map(item => {
      if (item.id !== editingRoutineId.value) return item;
      const { remark, ...routine } = item;
      return renameItem(routine, routineTitle.value.trim());
    })
    : [...workbenchData.value.items, createRoutine(routineTitle.value.trim())];
  if (saveTasks(nextItems)) closeRoutineForm();
}

function deleteRoutine(id) {
  if (deleteItem(id)) closeRoutineForm();
}

function deleteItem(id) {
  const item = workbenchData.value.items.find(candidate => candidate.id === id);
  if (!item || !storageReadable.value) return false;
  const typeLabel = { todo: '一次性待办', note: '随笔', routine: '日常持续', importantDate: '重要日', project: '项目', waiting: '等待中', creation: '娱乐/创作', shopping: '购物' }[item.type];
  const linkedNote = workbenchData.value.items.some(candidate => candidate.type === 'note' && candidate.convertedToId === id);
  const linkNotice = linkedNote ? '\n关联随笔会恢复为“未录入”，不会被删除。' : '';
  if (!window.confirm(`确定删除${typeLabel}“${item.title}”（创建于 ${new Date(item.createdAt).toLocaleString()}）吗？${linkNotice}\n此操作不能撤销。`)) return false;
  if (!saveTasks(removeItem(workbenchData.value.items, id))) return false;
  selectedTodoId.value = null;
  selectedDetailId.value = null;
  selectedProjectId.value = null;
  selectedNoteId.value = null;
  return true;
}

function addImportantDate() {
  if (!importantTitle.value.trim() || !importantTargetDate.value) { message.value = '请填写重要日名称和目标日期。'; return; }
  if (saveTasks([...workbenchData.value.items, createImportantDate(importantTitle.value.trim(), importantTargetDate.value)])) {
    importantTitle.value = '';
    importantTargetDate.value = '';
    showImportantForm.value = false;
  }
}

function closeImportantForm() {
  showImportantForm.value = false;
  importantTitle.value = '';
  importantTargetDate.value = '';
}

//导出任务备份
function exportTasks() {
  if (!storageReadable.value) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(workbenchData.value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'workbench-backup-v2.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 只在解析与校验全部通过后，才给出替换确认；选文件本身不会改动记录。
async function chooseBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  pendingImport.value = null;
  if (!file) return;
  if (!storageReadable.value) return;
  try {
    const data = JSON.parse(await file.text());
    pendingImport.value = validateWorkbenchData(data);
    pendingFileName.value = file.name;
    message.value = '';
  } catch (error) {
    message.value = error instanceof SyntaxError ? '文件不是有效的 JSON 备份。' : error.message;
  }
}

function confirmImport() {
  if (!storageReadable.value || !pendingImport.value) return;
  try {
    writeWorkbenchData(pendingImport.value);
    workbenchData.value = pendingImport.value;
    pendingImport.value = null;
    message.value = '备份导入成功，当前记录已替换。';
  } catch {
    message.value = '导入未完成：浏览器保存失败，原记录保留。请检查本地存储是否可用。';
  }
}
</script>

<template>
  <LaunchSplash />
  <main>
    <div class="page-status">
      <span v-if="offlineReady" role="status">页面已缓存，可以断网使用。</span>
      <span>记录保存在当前设备。</span>
    </div>
    <header><span class="eyebrow">Personal Workbench</span><h1>欢迎回来，从哪里开始干活？</h1></header>
    <section class="routine-strip" aria-label="日常持续">
      <div class="routine-strip-head">
        <div class="routine-chips">
          <button v-for="(item, index) in routines" :key="item.id" type="button" class="routine-chip" :disabled="!storageReadable" :aria-label="`编辑日常持续：${item.title}`" @click="openRoutineForm(item)">{{ item.title }}<span v-if="index < routines.length - 1" class="routine-separator" aria-hidden="true"> /</span></button>
          <span v-if="!routines.length" class="routine-empty">还没有日常提醒</span>
        </div>
        <button type="button" class="mini-add" :disabled="!storageReadable" :aria-label="showRoutineForm ? '关闭日常持续编辑' : '添加日常持续'" :aria-expanded="showRoutineForm" @click="showRoutineForm ? closeRoutineForm() : openRoutineForm()">{{ showRoutineForm ? '×' : '+' }}</button>
      </div>
      <form v-if="showRoutineForm" class="routine-editor" @submit.prevent="saveRoutine">
        <label for="routine-title">名称</label>
        <input id="routine-title" v-model="routineTitle" maxlength="150" placeholder="添加一条日常提醒" :disabled="!storageReadable">
        <div class="form-buttons">
          <button v-if="editingRoutineId" type="button" class="text-button danger delete-button" :disabled="!storageReadable" @click="deleteRoutine(editingRoutineId)">删除</button>
          <button type="button" class="secondary" @click="closeRoutineForm">取消</button>
          <button :disabled="!storageReadable">保存</button>
        </div>
      </form>
    </section>
    <form class="panel quick-form" @submit.prevent="addTask">
      <div class="quick-heading">
        <label for="task-title">快速记录</label>
        <small class="quick-hint">{{ quickType === 'default' ? '默认存入随笔；勾选后成为待办。' : '优先处理的事项会在本分类置顶。' }}</small>
      </div>
      <input id="task-title" v-model="title" maxlength="150" placeholder="记录一下..." :disabled="!storageReadable">
      <div class="form-actions">
        <div class="quick-options">
          <label><input v-model="needProcessing" type="checkbox"> {{ quickType === 'default' ? '需要处理' : '优先处理' }}</label>
          <label v-if="quickType === 'default' && needProcessing"><input v-model="urgent" type="checkbox"> 急需处理</label>
        </div>
        <div class="quick-actions">
          <button type="button" class="text-button more-toggle" :aria-expanded="showMoreOptions" @click="toggleMoreOptions">{{ showMoreOptions ? '收起选项' : '更多选项' }}</button>
          <button :disabled="!storageReadable">记录</button>
        </div>
      </div>
      <div v-if="showMoreOptions" class="more-options">
        <div class="quick-type-options" role="group" aria-label="记录类型">
          <button v-for="option in quickTypes" :key="option.type" type="button" :aria-pressed="quickType === option.type" @click="quickType = option.type; onQuickTypeChange()">{{ option.label }}</button>
          <button v-if="quickType !== 'default'" type="button" @click="quickType = 'default'; onQuickTypeChange()">清除选择</button>
        </div>
        <label v-if="quickType === 'importantDate'" for="quick-target-date">目标日期</label>
        <input v-if="quickType === 'importantDate'" id="quick-target-date" v-model="quickTargetDate" type="date" :disabled="!storageReadable">
      </div>
    </form>
    <div v-if="needRefresh" class="notice">有新版本可用。<button @click="updateServiceWorker()">更新应用</button></div>
    <p v-if="message" role="alert" class="error">{{ message }}</p>

    <section class="panel date-section" aria-label="重要日卡片">
      <p v-if="!importantDates.length" class="empty">还没有重要日，选一个值得记住的日期吧。</p>
      <div class="date-grid">
        <article v-for="item in importantDates" :key="item.id" class="date-card">
          <div class="item-line"><button type="button" class="date-card-title" :aria-expanded="selectedDetailId === item.id" @click="selectedDetailId = selectedDetailId === item.id ? null : item.id">{{ item.title }}</button><span v-if="item.priority === true" class="urgent-mark item-status">优先处理</span></div>
          <span class="date-count">{{ countdownText(item.targetDate) }}</span>
          <time :datetime="item.targetDate">{{ item.targetDate }}</time>
          <div v-if="selectedDetailId === item.id" class="item-detail detail-actions"><button type="button" class="text-button danger delete-button" :disabled="!storageReadable" @click="deleteItem(item.id)">删除</button></div>
        </article>
      </div>
      <form v-if="showImportantForm" class="date-form" @submit.prevent="addImportantDate">
        <label for="important-title">名称</label>
        <input id="important-title" v-model="importantTitle" maxlength="150" placeholder="例如：毕业纪念日" :disabled="!storageReadable">
        <label for="important-date">目标日期</label>
        <input id="important-date" v-model="importantTargetDate" type="date" :disabled="!storageReadable">
        <div class="form-buttons"><button type="button" class="secondary" @click="closeImportantForm">取消</button><button :disabled="!storageReadable">保存</button></div>
      </form>
      <div class="section-actions"><button type="button" class="mini-add date-add" :disabled="!storageReadable" :aria-label="showImportantForm ? '关闭重要日添加' : '添加重要日'" :aria-expanded="showImportantForm" @click="showImportantForm ? closeImportantForm() : showImportantForm = true">{{ showImportantForm ? '×' : '+' }}</button></div>
    </section>

    <section class="panel project-section">
      <div class="category-heading">
        <button type="button" class="category-expand" :aria-expanded="showProjects" :aria-label="`${showProjects ? '收起' : '展开'}项目`" @click="showProjects = !showProjects"><span class="fold-mark" aria-hidden="true">{{ showProjects ? 'v' : '>' }}</span><span>项目</span><small>{{ projects.length }}</small></button>
        <button type="button" class="mini-add" :disabled="!storageReadable" :aria-label="addingCategory === 'project' ? '关闭项目添加' : '添加项目'" @click="openCategoryForm('project')">{{ addingCategory === 'project' ? '×' : '+' }}</button>
      </div>
      <ProjectCreate v-if="addingCategory === 'project'" :can-edit="storageReadable" :available-tags="availableProjectTags" :save-project="createFullProject" @close="addingCategory = null" />
      <p v-if="showProjects && !projects.length" class="empty">还没有项目</p>
      <article v-for="(item, index) in visibleProjects" :key="item.id" class="category-row">
        <div class="item-line"><button type="button" class="category-title project-list-trigger" :aria-label="item.title ? undefined : '打开空名称项目详情'" :aria-expanded="selectedProjectId === item.id" @click="toggleProjectDetails(item.id)">{{ item.title }}<span v-for="tag in item.tags" :key="tag" class="project-user-tag">#{{ tag.replace(/^#+/, '') }}</span><span v-if="!showProjects && projects.length > 2 && index === 1" class="more-ellipsis" aria-hidden="true">……</span></button><span v-if="item.priority === true" class="urgent-mark item-status">优先处理</span></div>
        <p class="project-next-step">{{ item.nextStep }}</p>
        <ProjectDetail v-if="selectedProjectId === item.id" :project="item" :can-edit="storageReadable" :available-tags="availableProjectTags" :save-project="saveProject" :delete-project="deleteItem" @close="selectedProjectId = null" />
      </article>
    </section>

    <section class="panel">
      <div class="category-heading">
        <button type="button" class="category-expand" :aria-expanded="showOpenTodos" :aria-label="`${showOpenTodos ? '收起' : '展开'}一次性待办`" @click="showOpenTodos = !showOpenTodos"><span class="fold-mark" aria-hidden="true">{{ showOpenTodos ? 'v' : '>' }}</span><span>一次性待办</span><small>{{ openTodos.length }}</small></button>
        <button type="button" class="mini-add" :disabled="!storageReadable" :aria-label="addingCategory === 'todo' ? '关闭一次性待办添加' : '添加一次性待办'" @click="openCategoryForm('todo')">{{ addingCategory === 'todo' ? '×' : '+' }}</button>
      </div>
      <form v-if="addingCategory === 'todo'" class="category-add-form" @submit.prevent="addCategoryItem">
        <input id="todo-title" v-model="categoryTitle" aria-label="一次性待办内容" maxlength="150" :disabled="!storageReadable" placeholder="新待办">
        <div class="form-buttons"><button type="button" class="secondary" @click="openCategoryForm('todo')">取消</button><button :disabled="!storageReadable">保存</button></div>
      </form>
      <p v-if="showOpenTodos && !openTodos.length" class="empty">这里暂时没有待办。</p>
      <OrdinaryItem v-for="(task, index) in visibleOpenTodos" :key="task.id" :item="task" :can-edit="storageReadable" :expanded="selectedTodoId === task.id" :ellipsis="!showOpenTodos && openTodos.length > 2 && index === 1" :save-item="saveOrdinaryItem" @expand="selectedTodoId = selectedTodoId === task.id ? null : task.id" @complete="toggleTask(task.id)" @delete="deleteItem(task.id)" />
    </section>

    <section v-for="category in categories" :key="category.type" class="panel category-section">
      <div class="category-heading">
        <button type="button" class="category-expand" :aria-expanded="expandedCategories[category.type]" :aria-label="`${expandedCategories[category.type] ? '收起' : '展开'}${category.label}`" @click="expandedCategories[category.type] = !expandedCategories[category.type]">
          <span class="fold-mark" aria-hidden="true">{{ expandedCategories[category.type] ? 'v' : '>' }}</span><span>{{ category.label }}</span><small>{{ categoryItems(category.type).length }}</small>
        </button>
        <button type="button" class="mini-add" :disabled="!storageReadable" :aria-label="`${addingCategory === category.type ? '关闭' : '添加'}${category.label}`" @click="openCategoryForm(category.type)">{{ addingCategory === category.type ? '×' : '+' }}</button>
      </div>
      <form v-if="addingCategory === category.type" class="category-add-form" @submit.prevent="addCategoryItem">
        <input :id="`add-${category.type}`" v-model="categoryTitle" :aria-label="`${category.label}内容`" maxlength="150" :disabled="!storageReadable" placeholder="写点什么...">
        <div class="form-buttons"><button type="button" class="secondary" @click="openCategoryForm(category.type)">取消</button><button :disabled="!storageReadable">保存</button></div>
      </form>
      <p v-if="!categoryItems(category.type).length" class="empty">{{ category.type === 'note' ? '随手记下的内容会出现在这里。' : `还没有${category.label}记录。` }}</p>
      <OrdinaryItem v-for="(item, index) in visibleCategoryItems(category.type)" :key="item.id" :item="item" :can-edit="storageReadable" :expanded="item.type === 'note' ? selectedNoteId === item.id : selectedDetailId === item.id" :ellipsis="!expandedCategories[category.type] && categoryItems(category.type).length > 2 && index === 1" :save-item="saveOrdinaryItem" @expand="item.type === 'note' ? openNoteDetails(item) : selectedDetailId = selectedDetailId === item.id ? null : item.id" @complete="toggleTask(item.id)" @delete="deleteItem(item.id)">
        <form v-if="selectedNoteId === item.id && !item.convertedToId" class="conversion-form" @submit.prevent="saveNoteConversion">
          <label :for="`convert-${item.id}`">转成</label>
          <select :id="`convert-${item.id}`" v-model="conversionType">
            <option value="todo">一次性待办</option><option value="project">项目</option>
            <option value="importantDate">重要日</option><option value="shopping">购物</option>
            <option value="waiting">等待中</option><option value="creation">娱乐/创作</option>
          </select>
          <label v-if="conversionType === 'importantDate'" :for="`convert-date-${item.id}`">目标日期</label>
          <input v-if="conversionType === 'importantDate'" :id="`convert-date-${item.id}`" v-model="conversionDate" type="date" :disabled="!storageReadable">
          <div class="form-buttons"><button type="button" class="secondary" @click="selectedNoteId = null">取消</button><button :disabled="!storageReadable">确认录入</button></div>
        </form>
      </OrdinaryItem>
    </section>

    <section class="panel completed-section">
      <button type="button" class="category-expand" :aria-expanded="showCompleted" :aria-label="`${showCompleted ? '收起' : '展开'}已完成`" @click="showCompleted = !showCompleted"><span class="fold-mark" aria-hidden="true">{{ showCompleted ? 'v' : '>' }}</span><span>已完成</span><small>{{ completedCount }}</small></button>
      <div v-if="showCompleted">
        <p v-if="!completedCount" class="empty">还没有已完成的事项。</p>
        <OrdinaryItem v-for="task in completedTodos" :key="task.id" :item="task" :can-edit="storageReadable" :expanded="selectedTodoId === task.id" :save-item="saveOrdinaryItem" @expand="selectedTodoId = selectedTodoId === task.id ? null : task.id" @complete="toggleTask(task.id)" @delete="deleteItem(task.id)" />
        <article v-for="item in completedProjects" :key="item.id" class="category-row completed-project">
          <div class="item-line"><button type="button" class="category-title project-list-trigger" :aria-label="item.title ? undefined : '打开已完成的空名称项目详情'" :aria-expanded="selectedProjectId === item.id" @click="toggleProjectDetails(item.id)">{{ item.title }}<span v-for="tag in item.tags" :key="tag" class="project-user-tag">#{{ tag.replace(/^#+/, '') }}</span></button><span v-if="item.priority === true" class="urgent-mark item-status">优先处理</span></div>
          <p class="project-next-step">{{ item.nextStep }}</p>
          <ProjectDetail v-if="selectedProjectId === item.id" :project="item" :can-edit="storageReadable" :available-tags="availableProjectTags" :save-project="saveProject" :delete-project="deleteItem" @close="selectedProjectId = null" />
        </article>
      </div>
    </section>
    <footer>
      <button class="secondary" :disabled="!storageReadable" @click="exportTasks">导出完整备份</button>
      <label class="backup-label" for="backup-file">导入备份（JSON 文件）</label>
      <input id="backup-file" type="file" accept=".json,application/json" :disabled="!storageReadable" @change="chooseBackup">
      <p>导入会替换当前全部记录，请先导出当前备份。备份仅在当前设备／浏览器处理，不涉及云同步。清除网站数据会删除本地记录。</p>
      <div v-if="pendingImport" class="import-confirm" role="alert">
        <p>“{{ pendingFileName }}”校验通过：将用 {{ pendingImport.items.length }} 条记录替换当前 {{ workbenchData.items.length }} 条记录。确定导入吗？</p>
        <div class="import-actions">
          <button @click="confirmImport">确认替换</button>
          <button class="secondary" @click="pendingImport = null">取消</button>
        </div>
      </div>
    </footer>
  </main>
</template>
