<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import LaunchSplash from './components/LaunchSplash.vue';
import { convertNote, createImportantDate, createNote, createRoutine, createSimpleItem, createTodo, daysUntil, emptyWorkbenchData, isCalendarDate, readWorkbenchData, renameItem, toggleTodo, validateWorkbenchData, writeWorkbenchData } from './data/workbenchData.js';

const workbenchData = ref(emptyWorkbenchData());
const tasks = computed(() => workbenchData.value.items.filter(item => item.type === 'todo'));
const title = ref('');//保存输入框当前的文字。
const urgent = ref(false);//保存“急需处理”复选框是否勾选。
const message = ref('');//保存需要展示给用户的错误提示
const needProcessing = ref(false);
const showMoreOptions = ref(false);
const quickType = ref('default');
const quickTargetDate = ref('');
const routineTitle = ref('');
const routineRemark = ref('');
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
const importantDates = computed(() => workbenchData.value.items.filter(item => item.type === 'importantDate'));
const openTodos = computed(() => tasks.value.filter(task => !task.done).sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt)));
const completedTodos = computed(() => tasks.value.filter(task => task.done).sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
const projects = computed(() => workbenchData.value.items.filter(item => item.type === 'project').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
function categoryItems(type) {
  return workbenchData.value.items.filter(item => item.type === type).sort((a, b) =>
    type === 'note' ? Number(Boolean(a.convertedToId)) - Number(Boolean(b.convertedToId)) || b.createdAt.localeCompare(a.createdAt)
      : b.createdAt.localeCompare(a.createdAt));
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
});
onBeforeUnmount(() => {
  clearTimeout(midnightTimer);
  document.removeEventListener('visibilitychange', refreshToday);
});

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
  if (!title.value.trim()) { message.value = '请先填写记录内容。'; return; }//非空字符串在 JS 里算 true,trim()删掉了title.value两端的空格之后，再！判断是否ture
  if (quickType.value === 'importantDate' && !isCalendarDate(quickTargetDate.value)) {
    message.value = '请先选择有效的目标日期。'; return;
  }
  const item = quickType.value === 'default'
    ? (needProcessing.value ? createTodo(title.value.trim(), urgent.value) : createNote(title.value.trim()))
    : quickType.value === 'importantDate'
      ? createImportantDate(title.value.trim(), quickTargetDate.value)
      : createSimpleItem(quickType.value, title.value.trim());
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
  }
}

function openCategoryForm(type) {
  addingCategory.value = addingCategory.value === type ? null : type;
  categoryTitle.value = '';
}

function addCategoryItem() {
  if (!categoryTitle.value.trim()) { message.value = '请先填写内容。'; return; }
  const item = addingCategory.value === 'note'
    ? createNote(categoryTitle.value.trim()) : createSimpleItem(addingCategory.value, categoryTitle.value.trim());
  if (saveTasks([...workbenchData.value.items, item])) {
    categoryTitle.value = '';
    addingCategory.value = null;
  }
}

function openNoteConversion(item) {
  if (item.convertedToId) return;
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
  saveTasks(workbenchData.value.items.map(item => item.id === id && item.type === 'todo' ? toggleTodo(item) : item));
}
// { ...task }展开task属性；完成状态与完成时间一起改变。

function openRoutineForm(item = null) {
  editingRoutineId.value = item?.id ?? null;
  routineTitle.value = item?.title ?? '';
  routineRemark.value = item?.remark ?? '';
  showRoutineForm.value = true;
}

function closeRoutineForm() {
  showRoutineForm.value = false;
  editingRoutineId.value = null;
  routineTitle.value = '';
  routineRemark.value = '';
}

function saveRoutine() {
  if (!routineTitle.value.trim()) { message.value = '请先填写日常持续事项。'; return; }
  const remark = routineRemark.value.trim();
  const nextItems = editingRoutineId.value
    ? workbenchData.value.items.map(item => item.id === editingRoutineId.value ? { ...renameItem(item, routineTitle.value.trim()), remark } : item)
    : [...workbenchData.value.items, { ...createRoutine(routineTitle.value.trim()), ...(remark ? { remark } : {}) }];
  if (saveTasks(nextItems)) closeRoutineForm();
}

function deleteRoutine(id) {
  if (!window.confirm('确定删除这条日常持续提醒吗？')) return;
  if (saveTasks(workbenchData.value.items.filter(item => item.id !== id))) closeRoutineForm();
}

function addImportantDate() {
  if (!importantTitle.value.trim() || !importantTargetDate.value) { message.value = '请填写重要日名称和目标日期。'; return; }
  if (saveTasks([...workbenchData.value.items, createImportantDate(importantTitle.value.trim(), importantTargetDate.value)])) {
    importantTitle.value = '';
    importantTargetDate.value = '';
    showImportantForm.value = false;
  }
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
        <label for="routine-remark">备注（可选）</label>
        <input id="routine-remark" v-model="routineRemark" maxlength="300" placeholder="补充一点提示" :disabled="!storageReadable">
        <div class="routine-editor-actions">
          <button :disabled="!storageReadable">保存</button>
          <button type="button" class="text-button" @click="closeRoutineForm">取消</button>
          <button v-if="editingRoutineId" type="button" class="text-button danger" :disabled="!storageReadable" @click="deleteRoutine(editingRoutineId)">删除</button>
        </div>
      </form>
    </section>
    <form class="panel quick-form" @submit.prevent="addTask">
      <label for="task-title">快速记录</label>
      <input id="task-title" v-model="title" maxlength="150" placeholder="记录一下..." :disabled="!storageReadable">
      <div class="form-actions">
        <div class="quick-options">
          <label v-if="quickType === 'default'"><input v-model="needProcessing" type="checkbox"> 需要处理</label>
          <label v-if="quickType === 'default' && needProcessing"><input v-model="urgent" type="checkbox"> 急需处理</label>
        </div>
        <button :disabled="!storageReadable">记录</button>
      </div>
      <button type="button" class="text-button more-toggle" :aria-expanded="showMoreOptions" @click="toggleMoreOptions">{{ showMoreOptions ? '收起选项' : '更多选项' }}</button>
      <div v-if="showMoreOptions" class="more-options">
        <label for="quick-type">记录到</label>
        <select id="quick-type" v-model="quickType">
          <option value="default">默认（随笔 / 需要处理时为待办）</option>
          <option value="importantDate">重要日</option>
          <option value="project">项目</option>
          <option value="shopping">购物</option>
          <option value="waiting">等待中</option>
          <option value="creation">娱乐/创作</option>
        </select>
        <label v-if="quickType === 'importantDate'" for="quick-target-date">目标日期</label>
        <input v-if="quickType === 'importantDate'" id="quick-target-date" v-model="quickTargetDate" type="date" :disabled="!storageReadable">
      </div>
      <p class="hint">{{ quickType === 'default' ? '不勾选“需要处理”时，记录会进入随笔。' : quickType === 'shopping' ? '购物记录会自动记下加入时间。' : '记录会进入所选分类。' }}</p>
    </form>
    <p v-if="offlineReady" class="notice" role="status">页面已缓存，可以断网使用。记录保存在当前设备。</p>
    <div v-if="needRefresh" class="notice">有新版本可用。<button @click="updateServiceWorker()">更新应用</button></div>
    <p v-if="message" role="alert" class="error">{{ message }}</p>

    <section class="panel date-section" aria-label="重要日卡片">
      <p v-if="!importantDates.length" class="empty">还没有重要日，选一个值得记住的日期吧。</p>
      <div class="date-grid">
        <article v-for="item in importantDates" :key="item.id" class="date-card">
          <strong>{{ item.title }}</strong>
          <span class="date-count">{{ countdownText(item.targetDate) }}</span>
          <time :datetime="item.targetDate">{{ item.targetDate }}</time>
        </article>
      </div>
      <form v-if="showImportantForm" class="date-form" @submit.prevent="addImportantDate">
        <label for="important-title">名称</label>
        <input id="important-title" v-model="importantTitle" maxlength="150" placeholder="例如：毕业纪念日" :disabled="!storageReadable">
        <label for="important-date">目标日期</label>
        <input id="important-date" v-model="importantTargetDate" type="date" :disabled="!storageReadable">
        <button :disabled="!storageReadable">保存重要日</button>
      </form>
      <div class="section-actions"><button type="button" class="mini-add date-add" :disabled="!storageReadable" :aria-label="showImportantForm ? '关闭重要日添加' : '添加重要日'" :aria-expanded="showImportantForm" @click="showImportantForm = !showImportantForm">{{ showImportantForm ? '×' : '+' }}</button></div>
    </section>

    <section class="panel project-section">
      <h2>项目 <small>{{ projects.length }}</small></h2>
      <p v-if="!projects.length" class="empty">还没有项目，可以从“更多选项”新建。</p>
      <article v-for="item in projects" :key="item.id" class="category-row">
        <p>{{ item.title }}</p><time :datetime="item.createdAt">创建于 {{ new Date(item.createdAt).toLocaleString() }}</time>
      </article>
    </section>

    <section class="panel">
      <h2>一次性待办 <small>{{ openTodos.length }}</small></h2>
      <p v-if="!openTodos.length" class="empty">这里暂时没有待办。</p>
      <div v-for="task in openTodos" :key="task.id" class="todo-row">
        <label class="todo-check"><input type="checkbox" :checked="task.done" :disabled="!storageReadable" :aria-label="`完成 ${task.title}`" @change="toggleTask(task.id)"></label>
        <button class="todo-title" :aria-expanded="selectedTodoId === task.id" @click="selectedTodoId = selectedTodoId === task.id ? null : task.id">{{ task.title }}</button>
        <span v-if="task.urgent" class="urgent-mark">急需处理</span>
        <div v-if="selectedTodoId === task.id" class="todo-detail">创建于 {{ new Date(task.createdAt).toLocaleString() }}<span v-if="task.updatedAt !== task.createdAt"> · 更新于 {{ new Date(task.updatedAt).toLocaleString() }}</span></div>
      </div>
    </section>

    <section v-for="category in categories" :key="category.type" class="panel category-section">
      <div class="category-heading">
        <button type="button" class="category-expand" :aria-expanded="expandedCategories[category.type]" :aria-label="`${expandedCategories[category.type] ? '收起' : '展开'}${category.label}`" @click="expandedCategories[category.type] = !expandedCategories[category.type]">
          <span>{{ category.label }}</span><small>{{ categoryItems(category.type).length }}</small><span class="fold-mark" aria-hidden="true">{{ expandedCategories[category.type] ? '⌃' : '⌄' }}</span>
        </button>
        <button type="button" class="mini-add" :disabled="!storageReadable" :aria-label="`添加${category.label}`" @click="openCategoryForm(category.type)">+</button>
      </div>
      <form v-if="addingCategory === category.type" class="category-add-form" @submit.prevent="addCategoryItem">
        <label :for="`add-${category.type}`">{{ category.label }}内容</label>
        <input :id="`add-${category.type}`" v-model="categoryTitle" maxlength="150" :disabled="!storageReadable" placeholder="写点什么...">
        <div class="inline-actions"><button :disabled="!storageReadable">保存</button><button type="button" class="text-button" @click="openCategoryForm(category.type)">取消</button></div>
      </form>
      <p v-if="!categoryItems(category.type).length" class="empty">{{ category.type === 'note' ? '随手记下的内容会出现在这里。' : `还没有${category.label}记录。` }}</p>
      <article v-for="item in visibleCategoryItems(category.type)" :key="item.id" class="category-row" :class="{ 'converted-note': item.type === 'note' && item.convertedToId }">
        <template v-if="item.type === 'note'">
          <button v-if="!item.convertedToId" type="button" class="category-title" :aria-expanded="selectedNoteId === item.id" @click="openNoteConversion(item)">{{ item.title }}</button>
          <p v-else class="category-title"><span class="note-struck">{{ item.title }}</span> <span class="recorded-mark">已录入</span></p>
        </template>
        <p v-else class="category-title">{{ item.title }}</p>
        <time :datetime="item.createdAt">{{ item.type === 'shopping' ? '加入于 ' : '' }}{{ new Date(item.createdAt).toLocaleString() }}</time>
        <form v-if="selectedNoteId === item.id && !item.convertedToId" class="conversion-form" @submit.prevent="saveNoteConversion">
          <label :for="`convert-${item.id}`">转成</label>
          <select :id="`convert-${item.id}`" v-model="conversionType">
            <option value="todo">一次性待办</option><option value="project">项目</option>
            <option value="importantDate">重要日</option><option value="shopping">购物</option>
            <option value="waiting">等待中</option><option value="creation">娱乐/创作</option>
          </select>
          <label v-if="conversionType === 'importantDate'" :for="`convert-date-${item.id}`">目标日期</label>
          <input v-if="conversionType === 'importantDate'" :id="`convert-date-${item.id}`" v-model="conversionDate" type="date" :disabled="!storageReadable">
          <div class="inline-actions"><button :disabled="!storageReadable">确认录入</button><button type="button" class="text-button" @click="selectedNoteId = null">取消</button></div>
        </form>
      </article>
      <button v-if="categoryItems(category.type).length > 2" type="button" class="text-button category-show-all" @click="expandedCategories[category.type] = !expandedCategories[category.type]">{{ expandedCategories[category.type] ? '收起到 2 条' : `展开其余 ${categoryItems(category.type).length - 2} 条` }}</button>
    </section>

    <details class="panel completed-section">
      <summary>已完成 <small>{{ completedTodos.length }}</small></summary>
      <p v-if="!completedTodos.length" class="empty">还没有已完成的待办。</p>
      <div v-for="task in completedTodos" :key="task.id" class="todo-row completed">
        <label class="todo-check"><input type="checkbox" :checked="task.done" :disabled="!storageReadable" :aria-label="`恢复 ${task.title}`" @change="toggleTask(task.id)"></label>
        <button class="todo-title" :aria-expanded="selectedTodoId === task.id" @click="selectedTodoId = selectedTodoId === task.id ? null : task.id">{{ task.title }}</button>
        <div v-if="selectedTodoId === task.id" class="todo-detail">完成于 {{ new Date(task.completedAt).toLocaleString() }}</div>
      </div>
    </details>
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
