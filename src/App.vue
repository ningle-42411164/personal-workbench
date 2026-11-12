<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import ReminderBanner from './components/ReminderBanner.vue';
import {setReminderDate,createReminderQueue} from './data/reminders.js';
import QuickTagPicker from './components/QuickTagPicker.vue';
import { sortedCompleted, completedBatchLimit, toggleFavorite } from './data/completedItems.js';
import TagRuleSettings from './components/TagRuleSettings.vue';
import { readTagRules, writeTagRules, matchedTags } from './data/tagRules.js';
import GlobalSearch from './components/GlobalSearch.vue';
import CategoryChevron from './components/CategoryChevron.vue';
import ProjectCard from './components/ProjectCard.vue';
import { isCompletedItem } from './data/searchItems.js';
import LaunchSplash from './components/LaunchSplash.vue';
import ImportantDateDeck from './components/ImportantDateDeck.vue';
import SuccessMessages from './components/SuccessMessages.vue';
import PinnedMark from './components/PinnedMark.vue';
import SyncSymbol from './components/SyncSymbol.vue';
import QuickHelp from './components/QuickHelp.vue';
import SortList from './components/SortList.vue';
import SortToggle from './components/SortToggle.vue';
import { togglePin, compareRows, frontRank, moveRank, returnTodo } from './data/itemOrder.js';
import ProjectDialog from './components/ProjectDialog.vue';
import ProjectCreate from './components/ProjectCreate.vue';
import OrdinaryItem from './components/OrdinaryItem.vue';
import CloudConnection from './components/CloudConnection.vue';
import SyncSettings from './components/SyncSettings.vue';
import { useSyncWorkbench } from './sync/useSyncWorkbench.js';
import { equal } from './sync/syncStore.js';
import { isKnownTestRecord } from './sync/knownTestRecords.js';
import { useCloudWorkbench, fallbackNotice, localFallback } from './cloud/useCloudWorkbench.js';
import { normalizeUserTags, availableUserTags } from './data/userTags.js';
import { readSplashEnabled, writeSplashEnabled } from './data/splashPreference.js';
import { COMPLETABLE_TYPES, moveNote, createImportantDate, createNote, createRoutine, createSimpleItem, createTodo, emptyWorkbenchData, isCalendarDate, readWorkbenchData, removeItem, renameItem, toggleTodo, validateWorkbenchData } from './data/workbenchData.js';

// 只有原首页这一套工作视图；手机更新后按已授权的节点一规则自动纳入待办和项目。
const cloud = useCloudWorkbench();
const cloudState = cloud.state;
const sync = useSyncWorkbench();
const syncSnapshot = sync.snapshot;
const syncStatus = sync.status;
// 仅合并同一次离线事件产生的重复提示；其他授权/读取/同步错误原样保留。
const repeatedOffline = computed(() => syncStatus.value.phase === 'offline' && cloudState.value.message === '离线／内容可能已过期。联网后可重新读取；本批没有离线写入。');
const splashEnabled = ref(readSplashEnabled());
// 进入时先决定是否挂载动画；开关修改影响下一次进入，已挂载动画仍按原会话/关闭逻辑运行。
//readSplashEnabled()读取浏览器本地存储的启动动画开关状态，返回 true 或 false
const showSplash = splashEnabled.value;
const splashPreferenceError = ref('');

function toggleSplashPreference() {
  try {
    const nextEnabled = !splashEnabled.value;
    // 写入成功才改变开关，刷新时读取同一个 key；失败时不显示“已保存”的假状态。
    writeSplashEnabled(nextEnabled);
    splashEnabled.value = nextEnabled;
    splashPreferenceError.value = '';
  } catch {
    splashPreferenceError.value = '启动动画设置未保存，请检查浏览器是否允许本地存储。';
  }
}

// 唯一的持久化数据入口：保存成功后替换 .value，Vue 会更新依赖它的列表，不需要手动改 DOM。
const workbenchData = ref(emptyWorkbenchData());
// 已知测试记录按固定 ID 从正式视图排除，完整本机原文仍保留，避免破坏旧备份或转换关联。
const personalItems = computed(() => workbenchData.value.items.filter(item => !isKnownTestRecord(item.id)));
// 编辑中的普通事项固定留在原分组；云端完成/删除不能卸载控件并丢掉尚未提交的输入。
const editingOrdinary = ref({});
const viewItems = computed(() => [
  ...personalItems.value.map(item => editingOrdinary.value[item.id] ?? item),
  ...Object.values(editingOrdinary.value).filter(item => !isKnownTestRecord(item.id) && !personalItems.value.some(current => current.id === item.id)),
]);
function protectOrdinary(id, item) {
  if (item) editingOrdinary.value = { ...editingOrdinary.value, [id]: item };
  else { const next = { ...editingOrdinary.value }; delete next[id]; editingOrdinary.value = next; queueMicrotask(()=>void checkReminders()); }
}
// computed 是“从已有数据算出结果”，不是第二份数据库；items 改变时，这个待办视图也会重新计算。
const tasks = computed(() => viewItems.value.filter(item => item.type === 'todo'));
const title = ref('');//保存输入框当前的文字。
const urgent = ref(false);//保存“急需处理”复选框是否勾选。
const message = ref('');//保存需要展示给用户的错误提示
const needProcessing = ref(false);
const showMoreOptions = ref(false);
const quickType = ref('default');
// 标签随整份草稿保留；收起和切换类型不清空，保存成功才清空。
const quickTags = ref([]);
const tagPickerOpen = ref(false), tagRulesOpen = ref(false), removedQuickTags = ref([]);
const tagRules = ref([]), tagRulesError = ref('');
try { tagRules.value = readTagRules(); } catch { tagRulesError.value = '本机标签规则读取失败，原设置未覆盖。'; }
const selectedQuickTags = computed(() => normalizeUserTags([...quickTags.value,
  ...matchedTags(title.value, tagRules.value, availableProjectTags.value, removedQuickTags.value)]));
function selectQuickTag(tag) {
  quickTags.value = normalizeUserTags([...quickTags.value, tag]);
  removedQuickTags.value = removedQuickTags.value.filter(value => value !== tag);
}
function removeQuickTag(tag) {
  quickTags.value = quickTags.value.filter(value => value !== tag);
  removedQuickTags.value = [...new Set([...removedQuickTags.value, tag])];
}
function saveTagRules(rules) { writeTagRules(rules); tagRules.value = rules; tagRulesError.value = ''; }
const quickTargetDate = ref('');
const quickReminderDate = ref('');
const quickTypes = [
  { type: 'todo', label: '待办' }, { type: 'importantDate', label: '重要日' },
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
// 草稿、选中的详情和折叠状态只服务当前页面，不写入备份；刷新回到默认浏览状态。
const expandedCategories = ref({ note: false, waiting: false, creation: false, shopping: false });
const addingCategory = ref(null);
const categoryTitle = ref('');
const selectedNoteId = ref(null);
const conversionType = ref('todo');
const conversionDate = ref('');
const selectedTodoId = ref(null);
const selectedDetailId = ref(null);
const selectedProjectId = ref(null);
const projectAtOpen = ref(null);
const projectDialog = ref(null);
// 唯一详情从正式集合取项目，完成/恢复改变分组也不会先卸载编辑器。
const selectedProject = computed(() => selectedProjectId.value && (personalItems.value.find(item => item.type === 'project' && item.id === selectedProjectId.value)
  ?? (projectAtOpen.value?.id === selectedProjectId.value ? projectAtOpen.value : null)));
const showCompleted = ref(false);
const completedLimit = ref(10);
const themeKey = 'personal-workbench.theme.v1';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const themeMode = ref('system');
const themeError = ref('');
try {
  const saved = localStorage.getItem(themeKey);
  if (['system', 'light', 'dark'].includes(saved)) themeMode.value = saved;
} catch { /* 偏好不可读时跟随系统。 */ }
function applyTheme() {
  document.documentElement.dataset.theme = themeMode.value === 'system'
    ? (systemTheme.matches ? 'dark' : 'light') : themeMode.value;
}
function selectTheme(mode) {
  themeMode.value = mode;
  applyTheme();
  try { localStorage.setItem(themeKey, mode); themeError.value = ''; }
  catch { themeError.value = '主题已切换，但本机设置未保存。'; }
}
applyTheme();
systemTheme.addEventListener('change', applyTheme);
onBeforeUnmount(() => systemTheme.removeEventListener('change', applyTheme));
const showProjects = ref(false);
const projectPreview = ref(true);
const showOpenTodos = ref(true);
const today = ref(new Date());
const pendingImport = ref(null);
const importOpen = ref(false), readingImport = ref(false);
let importReadSequence = 0;
function openImport() {
  importReadSequence++;
  pendingImport.value = null; pendingFileName.value = ''; importError.value = '';
  readingImport.value = false; importOpen.value = true;
}
const pendingFileName = ref('');
const backupInput = ref(null), importError = ref(''), importing = ref(false), cloudSettingsOpen = ref(false);
const importBound = computed(() => Object.keys(syncSnapshot.value?.bindings ?? {}).length > 0);
const dateDeck = ref(null), searchMessage = ref('');
// 搜索只调整视图，不调用会保存输入的 flushOrdinary / locateCompleted。
async function locateSearch(id) {
  searchMessage.value = '';
  const item = personalItems.value.find(value => value.id === id);
  if (!item) { searchMessage.value = '该事项已不存在，请重新搜索。'; return; }
  if (selectedProjectId.value || addingCategory.value === 'project' || importOpen.value || tagRulesOpen.value) {
    searchMessage.value = '请先保存或取消当前弹窗中的编辑，再定位。'; return;
  }
  const protectedItem = editingOrdinary.value[id];
  if (protectedItem && (protectedItem.type !== item.type || isCompletedItem(protectedItem) !== isCompletedItem(item))) {
    searchMessage.value = '此事项仍在编辑，分类或完成状态已有变化；请先保存或取消，再定位。'; return;
  }
  sorting.value = null;
  if (isCompletedItem(item)) revealCompleted(id);
  else if (item.type === 'project') { showProjects.value = true; projectPreview.value = false; }
  else if (item.type === 'todo') showOpenTodos.value = true;
  else if (Object.hasOwn(expandedCategories.value, item.type)) expandedCategories.value[item.type] = true;
  await nextTick();
  if (item.type === 'importantDate') { dateDeck.value?.locate(id); await nextTick(); }
  if (!personalItems.value.some(value => value.id === id)) { searchMessage.value = '该事项已不存在，请重新搜索。'; return; }
  const row = document.getElementById((isCompletedItem(item) ? 'completed-' : 'item-') + id);
  if (!row) { searchMessage.value = '当前编辑状态暂不允许定位，请先保存或取消后重试。'; return; }
  row.scrollIntoView({ block: 'center' });
  highlighted.value = id;
  clearTimeout(highlightTimer); highlightTimer = setTimeout(() => { highlighted.value = null; }, 1000);
}
function cancelImport() { if (!importing.value) { importReadSequence++; importOpen.value = false; readingImport.value = false; pendingImport.value = null; pendingFileName.value = ''; importError.value = ''; } }
// 插件把 SW 的安装/更新事件转换成 Vue 状态；这不是 LocalStorage 保存成功的通知。
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();

// 浏览器保存的数据需要先校验，读取失败时不能悄悄覆盖旧数据。
const storageReadable = ref(false);
const localSaving = ref(false);
const canEditLocal = computed(() => storageReadable.value && !localSaving.value);
let localRevision = -1;
const reminderQueue=createReminderQueue({storage:localStorage}), reminderBanner=ref(null);
let reminderCheck;
function showReminders(){
  if(document.visibilityState==='hidden' || document.documentElement.classList.contains('splash-pending'))return;
  reminderBanner.value=reminderQueue.open(personalItems.value);
}
async function checkReminders(){
  if(!storageReadable.value || document.visibilityState==='hidden')return;
  if(reminderCheck)return reminderCheck;
  reminderCheck=(async()=>{
    try{await sync.checkReminders(new Date().toISOString(),Object.keys(editingOrdinary.value));showReminders();}
    catch(error){message.value=error.message;}
    finally{reminderCheck=null;}
  })();
  return reminderCheck;
}
function acknowledgeReminder(){reminderBanner.value=reminderQueue.acknowledge(personalItems.value);}
watch(personalItems,()=>{
  if(document.visibilityState!=='hidden')reminderBanner.value=reminderQueue.reconcile(personalItems.value);
  // 云端新日期在本机自然日检查；编辑保护仍由 ID 排除。
  if(storageReadable.value && !localSaving.value)void checkReminders();
});
try {
  workbenchData.value = readWorkbenchData();//先显示旧 v2 备份；事务存储就绪后才开放编辑。
} catch (error) {
  storageReadable.value = false;
  message.value = error.message;
}
watch(syncSnapshot, next => {
  if (next && next.revision !== localRevision) { workbenchData.value = next.data; localRevision = next.revision; }
});
void sync.initialize().then(next => {
  workbenchData.value = next.data; localRevision = next.revision; storageReadable.value = true;
  void checkReminders();
}).catch(error => { storageReadable.value = false; message.value = error.message; });

// filter 先生成新数组，再 sort 排序，所以首页分组不会直接重排持久化的 items。
const routines = computed(() => personalItems.value.filter(item => item.type === 'routine'));
const importantDates = computed(() => personalItems.value.filter(item => item.type === 'importantDate').sort(compareRows));
const openTodos = computed(() => tasks.value.filter(task => !task.done).sort(compareRows));
const completedTodos = computed(() => viewItems.value.filter(item => COMPLETABLE_TYPES.includes(item.type) && item.done).sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
const projects = computed(() => personalItems.value.filter(item => item.type === 'project' && item.status !== 'done').sort(compareRows));
const completedProjects = computed(() => personalItems.value.filter(item => item.type === 'project' && item.status === 'done').sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
const completedItems = computed(() => sortedCompleted([...completedTodos.value, ...completedProjects.value]));
const visibleCompletedItems = computed(() => completedItems.value.slice(0, completedLimit.value));
function revealCompleted(id) {
  completedLimit.value = completedBatchLimit(completedItems.value, id, completedLimit.value);
  showCompleted.value = true;
}
async function collapseCompleted() {
  if (!await flushOrdinary()) return;
  showCompleted.value = false;
  await nextTick();
  document.getElementById('completed-heading')?.scrollIntoView({ block: 'start' });
}
const completedCount = computed(() => completedTodos.value.length + completedProjects.value.length);
const visibleProjects = computed(() => showProjects.value ? projects.value : projectPreview.value ? projects.value.filter(item => item.status !== 'paused').slice(0, 2) : []);
const visibleOpenTodos = computed(() => showOpenTodos.value ? openTodos.value : []);
const availableProjectTags = computed(() => availableUserTags(personalItems.value));
// 已完成只改变原记录的状态，不搬到另一份数据；这里筛走 done 的事项，已完成区再筛出它们。
function categoryItems(type) {
  return viewItems.value.filter(item => item.type === type && !item.done).sort(compareRows);
}
function visibleCategoryItems(type) {
  const items = categoryItems(type);
  // 普通分类折叠只影响展示，原事项继续保存在完整集合。
  return expandedCategories.value[type] ? items : [];
}

const projectCreate = ref(null);
const sorting = ref(null), successMessages = ref(null), highlighted = ref(null);
let highlightTimer;
const notify = (text, target) => successMessages.value?.push(text, target);
watch(fallbackNotice, () => notify('已转为本地模式'));
const creationText = { note:'随笔+1', todo:'待办+1', project:'已创建新项目！' };
function completedMessage(item, done) {
  if (done) notify(`已完成「${item.title}」`, { id:item.id, type:item.type });
  else notify(`已恢复「${item.title}」为未完成`);
}
async function locateCompleted(target) {
  const exists = () => [...completedTodos.value, ...completedProjects.value].some(item => item.id === target.id && item.type === target.type);
  if (!exists() || !await flushOrdinary()) return;
  if (addingCategory.value === 'project' && !projectCreate.value?.requestClose()) return;
  if (editingRoutineId.value) {
    await saveRoutine();
    if (editingRoutineId.value) return;
  }
  if (selectedProjectId.value) {
    if (!await projectDialog.value?.saveBeforeLeave()) return;
    selectedProjectId.value = null;
  }
  if (!exists()) return;
  revealCompleted(target.id);
  await nextTick();
  const row = document.getElementById('completed-' + target.id);
  if (!row || !exists()) return;
  row.scrollIntoView({ block:'center' });
  highlighted.value = target.id;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => { highlighted.value = null; }, 1000);
}
const ordinaryEditors = new Map();
function registerEditor(id, component) { if(component) ordinaryEditors.set(id,component); else ordinaryEditors.delete(id); }
async function flushOrdinary(){
  for(const id of Object.keys(editingOrdinary.value)) if(!await ordinaryEditors.get(id)?.finishEditing())return false;
  return true;
}
async function expandOrdinary(item){
  if(!await flushOrdinary())return;
  if(item.type==='note' && !item.done)openNoteDetails(item);
  else {const selected=item.type==='todo'||item.done?selectedTodoId:selectedDetailId; selected.value=selected.value===item.id?null:item.id;}
}
async function toggleCategory(type){
  if(!await flushOrdinary())return;
  if(type==='todo')showOpenTodos.value=!showOpenTodos.value;
  else if(type==='completed') { if (!showCompleted.value) completedLimit.value = 10; showCompleted.value=!showCompleted.value; }
  else expandedCategories.value[type]=!expandedCategories.value[type];
}
async function toggleSort(type) {
  if(!await flushOrdinary())return;
  sorting.value = sorting.value === type ? null : type;
  if (!sorting.value) return;
  if (type === 'project') { projectPreview.value=false; showProjects.value=true; }
  else if(type === 'todo') showOpenTodos.value=true;
  else expandedCategories.value[type]=true;
}
function sortRows(type){return type==='project'?projects.value:type==='todo'?openTodos.value:type==='importantDate'?importantDates.value:categoryItems(type);}
async function moveRow(rows,from,to) {
  if (!equal(rows,sortRows(sorting.value))) {message.value='列表已变化，请按最新顺序重新拖动。';return;}
  try {
    const rank = moveRank(rows, from, to);
    if (!rank) return;
    const items = workbenchData.value.items.map(item => item.id === rows[from].id ? { ...item, ...rank } : item);
    if (await saveTasks(items)) notify('排序已更新');
  } catch (error) { message.value = error.message; }
}
async function pinRow(item) {
  const next = togglePin(item);
  next.rank = frontRank(personalItems.value, next);
  if (await saveTasks(workbenchData.value.items.map(row => row.id === item.id ? next : row))) notify(next.pinned ? '已置顶' : '已取消置顶');
}
async function sendBack(id) {
  if (await saveTasks(returnTodo(workbenchData.value.items, id))) {
    selectedTodoId.value = null;
    notify('已退回随笔');
  }
}
let midnightTimer;
function refreshToday() {
  clearTimeout(midnightTimer);
  today.value = new Date();
  const now = today.value;
  // 用下一次本地午夜安排更新，不能固定等 24 小时，否则夏令时切换可能错过当天边界。
  midnightTimer = setTimeout(refreshToday, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 100);
}
onMounted(() => {
  refreshToday();
  document.addEventListener('visibilitychange', refreshToday);
  document.addEventListener('visibilitychange', checkReminders);
  window.addEventListener('pageshow',checkReminders);
});
onBeforeUnmount(() => {
  // 组件移除时同时清理定时器与 document 监听，避免旧页面逻辑继续运行。
  clearTimeout(midnightTimer);
  clearTimeout(highlightTimer);
  document.removeEventListener('visibilitychange', refreshToday);
  document.removeEventListener('visibilitychange',checkReminders);
  window.removeEventListener('pageshow',checkReminders);
});

async function toggleProjectDetails(id) {
  // 切换项目也经过同一保存检查；原生模态外壳会阻止直接操作背景列表。
  if (selectedProjectId.value && !await projectDialog.value?.saveBeforeLeave()) return;
  projectAtOpen.value = workbenchData.value.items.find(item => item.id === id) ?? null;
  selectedProjectId.value = selectedProjectId.value === id ? null : id;
}

async function createFullProject(project) {
  const saved = await saveTasks([...workbenchData.value.items, project]);
  if (saved) notify(creationText.project);
  return saved;
}


// 先确认保存成功，再更新页面，避免出现“看似保存但实际丢失”。
// 这个 saveTasks 仍负责浏览器保存和 Vue 状态；现在等待 IndexedDB 把事项与队列一起提交。
// 网络发送在保存成功之后自动安排，断网不影响本机事务成功。
async function saveTasks(nextTasks) {//nextTasks是这个函数接收的参数
  if (!canEditLocal.value) return false;
  localSaving.value = true;
  try {
    const previousIds = new Set(workbenchData.value.items.map(item => item.id));
    const items = nextTasks.map(item => !previousIds.has(item.id) && item.type !== 'routine' && item.rank === undefined
      ? {...item,rank:frontRank(nextTasks,item)} : item);
    const nextData = { ...workbenchData.value, items };
    const saved = await sync.save(nextData, localRevision, {reminderNow:new Date().toISOString(),skipReminderIds:Object.keys(editingOrdinary.value).filter(id=>equal(nextTasks.find(item=>item.id===id),workbenchData.value.items.find(item=>item.id===id)))});//仍保存完整 v2 内容，队列存放在独立元数据中。
    workbenchData.value = saved.data; localRevision = saved.revision;//事务成功后再更新页面
    message.value = '';
    showReminders();
    return true;
  } catch (error) {
    message.value = error.message || '保存失败，请检查浏览器是否允许本地存储。';
    return false;
  } finally { localSaving.value = false; }
}

// 学习笔记（第一步的写法）：
//创建新任务task后，把新任务和旧任务（...tasks.value）一起丢给saveTasks保存到浏览器
// 2.0 现在把各种类型的事项放在同一个 items 数组中。
async function addTask() {
  // default 是路由模式而非事项类型；明确选择类型后，复选框只控制 priority，不把分类改成 todo。
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
  item.tags = normalizeUserTags(selectedQuickTags.value);
  if(item.type==='waiting' && quickReminderDate.value){
    try{Object.assign(item,setReminderDate(item,quickReminderDate.value,now));}catch(error){message.value=error.message;return;}
  }
  // 先生成新数组交给保存入口，只有返回 true 才清空草稿，失败时输入和标签保留。
  if (await saveTasks([...workbenchData.value.items, item])) {
    if (creationText[item.type]) notify(creationText[item.type]);
    title.value = '';
    quickTags.value = []; removedQuickTags.value = []; tagPickerOpen.value = false;
    needProcessing.value = false;
    urgent.value = false;
    quickType.value = 'default';
    quickTargetDate.value = '';
    quickReminderDate.value = '';
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
  if (addingCategory.value && categoryTitle.value && !window.confirm('放弃尚未保存的内容？')) return;
  addingCategory.value = addingCategory.value === type ? null : type;
  categoryTitle.value = '';
}

async function addCategoryItem() {
  if (!categoryTitle.value.trim()) { message.value = '请先填写内容。'; return; }
  const item = addingCategory.value === 'note'
    ? createNote(categoryTitle.value.trim()) : addingCategory.value === 'todo'
      ? createTodo(categoryTitle.value.trim(), false) : createSimpleItem(addingCategory.value, categoryTitle.value.trim());
  if (await saveTasks([...workbenchData.value.items, item])) {
    if (creationText[item.type]) notify(creationText[item.type]);
    categoryTitle.value = '';
    addingCategory.value = null;
  }
}

function openNoteDetails(item) {
  selectedNoteId.value = selectedNoteId.value === item.id ? null : item.id;
  conversionType.value = 'todo';
  conversionDate.value = '';
}

async function saveNoteConversion() {
  try {
    const nextItems = moveNote(workbenchData.value.items, selectedNoteId.value, conversionType.value, conversionDate.value);
    const targetType = conversionType.value;
    if (await saveTasks(nextItems)) {
      selectedNoteId.value = null;
      if (targetType === 'todo') notify('已录入待办');
    }
  } catch (error) {
    message.value = error.message;
  }
}

//切换完成状态，id 是操作目标传进来的参数
async function toggleTask(id) {
  // map 保留非目标记录，只按稳定 ID 更新目标；完成时间由 toggleTodo 与 done 一起计算。
  const item = workbenchData.value.items.find(row => row.id === id);
  if (!item || !COMPLETABLE_TYPES.includes(item.type)) return;
  const next = toggleTodo(item);
  if (await saveTasks(workbenchData.value.items.map(row => row.id === id ? next : row))) completedMessage(next, next.done);
}
// { ...task }展开task属性；完成状态与完成时间一起改变。

async function saveFavorite(expectedItem) {
  const current = workbenchData.value.items.find(item => item.id === expectedItem.id);
  if (!current || !equal(current, expectedItem)) {
    message.value = '事项已发生变化，收藏未保存，请核对后重试。'; return false;
  }
  try {
    const next = toggleFavorite(current);
    if (!await saveTasks(workbenchData.value.items.map(item => item.id === current.id ? next : item))) return false;
    // 取消收藏可能把当前行移到后续批次，保持其挂载，不影响其他编辑草稿。
    if (showCompleted.value) revealCompleted(current.id);
    return true;
  } catch (error) { message.value = error.message; return false; }
}

async function saveOrdinaryItem(nextItem, editingBase) {
  if (editingBase && !equal(workbenchData.value.items.find(item => item.id === nextItem.id), editingBase)) {
    message.value = '此事项在编辑期间发生变化，输入保留，请核对新内容。'; return false;
  }
  const previous = workbenchData.value.items.find(item => item.id === nextItem.id);
  if (!previous) return false;
  if (equal(previous, nextItem)) return true;
  const saved = await saveTasks(workbenchData.value.items.map(item => item.id === nextItem.id ? nextItem : item));
  if (saved) notify('修改已保存到本机');
  return saved;
}

// 项目详情只负责生成新记录；沿用页面的“先写入、后更新”保存顺序。
async function saveProject(nextProject) {
  // find 确认原项目仍存在；详情组件提出新值，由父组件统一负责实际持久化。
  const previous = workbenchData.value.items.find(item => item.id === nextProject.id && item.type === 'project');
  if (equal(previous,nextProject)) return true;
  if (previous) nextProject = {...nextProject,rank:frontRank(personalItems.value,nextProject)};
  if (!previous || !await saveTasks(workbenchData.value.items.map(item => item.id === nextProject.id ? nextProject : item))) return false;
  if (previous.status !== nextProject.status && (previous.status === 'done' || nextProject.status === 'done')) completedMessage(nextProject, nextProject.status === 'done');
  else if (previous.status !== 'paused' && nextProject.status === 'paused') notify('项目已暂停');
  else if (previous.status === 'paused' && nextProject.status === 'active') notify('项目已恢复进行中');
  else notify('修改已保存到本机');
  return true;
}

function openRoutineForm(item = null) {
  editingRoutineId.value = item?.id ?? null;
  routineTitle.value = item?.title ?? '';
  showRoutineForm.value = true;
}

function requestRoutineClose(){if(editingRoutineId.value){void saveRoutine();return;}if(!routineTitle.value || window.confirm('放弃尚未保存的日常事项？'))closeRoutineForm();}
function closeRoutineForm() {
  showRoutineForm.value = false;
  editingRoutineId.value = null;
  routineTitle.value = '';
}

async function saveRoutine() {
  if (!routineTitle.value.trim()) { message.value = '请先填写日常持续事项。'; return; }
  const nextItems = editingRoutineId.value
    ? workbenchData.value.items.map(item => {
      if (item.id !== editingRoutineId.value) return item;
      const { remark, ...routine } = item;
      return renameItem(routine, routineTitle.value.trim());
    })
    : [...workbenchData.value.items, createRoutine(routineTitle.value.trim())];
  const editing = editingRoutineId.value;
  if (editing && workbenchData.value.items.find(item => item.id === editing)?.title === routineTitle.value.trim()) { closeRoutineForm(); return; }
  if (await saveTasks(nextItems)) {
    if (editing) notify('修改已保存到本机');
    closeRoutineForm();
  }
}

async function deleteRoutine(id) {
  if (await deleteItem(id)) closeRoutineForm();
}

async function deleteItem(id) {
  const item = workbenchData.value.items.find(candidate => candidate.id === id);
  if (!item || !storageReadable.value) return false;
  const typeLabel = { todo: '待办', note: '随笔', routine: '日常持续', importantDate: '重要日', project: '项目', waiting: '等待中', creation: '娱乐/创作', shopping: '购物' }[item.type];
  // some 只检查有没有关联随笔，用来提前说明删除目标后“已录入”标记会解除。
  const linkedNote = workbenchData.value.items.some(candidate => candidate.type === 'note' && candidate.convertedToId === id);
  const linkNotice = linkedNote ? '\n关联随笔会恢复为“未录入”，不会被删除。' : '';
  if (!window.confirm(`确定删除${typeLabel}“${item.title}”（创建于 ${new Date(item.createdAt).toLocaleString()}）吗？${linkNotice}\n此操作不能撤销。`)) return false;
  if (!await saveTasks(removeItem(workbenchData.value.items, id))) return false;
  notify(`已删除「${item.title}」`);
  selectedTodoId.value = null;
  selectedDetailId.value = null;
  selectedProjectId.value = null;
  selectedNoteId.value = null;
  return true;
}

async function addImportantDate() {
  if (!importantTitle.value.trim() || !importantTargetDate.value) { message.value = '请填写重要日名称和目标日期。'; return; }
  if (await saveTasks([...workbenchData.value.items, createImportantDate(importantTitle.value.trim(), importantTargetDate.value)])) {
    importantTitle.value = '';
    importantTargetDate.value = '';
    showImportantForm.value = false;
  }
}

function closeImportantForm() {
  if ((importantTitle.value || importantTargetDate.value) && !window.confirm('放弃尚未保存的重要日？')) return;
  showImportantForm.value = false;
  importantTitle.value = '';
  importantTargetDate.value = '';
}

//导出任务备份
function exportTasks() {
  if (!storageReadable.value) return;
  // JSON 文本装进 Blob，再用临时 URL 交给下载链接；它不是上传到服务器的地址。
  const url = URL.createObjectURL(new Blob([JSON.stringify(workbenchData.value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'workbench-backup-v2.json'; link.click();
  // 触发下载后释放临时 URL，避免反复导出留下不必要的内存引用。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 只在解析与校验全部通过后，才给出替换确认；选文件本身不会改动记录。
async function chooseBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  const readSequence = ++importReadSequence;
  pendingImport.value = null; pendingFileName.value = '';
  importError.value = '';
  if (!file) return;
  if (!storageReadable.value) return;
  try {
    // File.text 异步读取本地文件；JSON.parse 只还原数据，随后校验，尚未写入浏览器。
    readingImport.value = true;
    const data = JSON.parse(await file.text());
    if (readSequence !== importReadSequence || !importOpen.value) return;
    pendingImport.value = validateWorkbenchData(data);
    pendingFileName.value = file.name;
    message.value = '';
  } catch (error) {
    if (readSequence === importReadSequence && importOpen.value) importError.value = error instanceof SyntaxError ? '文件不是有效的 JSON 备份。' : error.message;
  } finally { if (readSequence === importReadSequence) readingImport.value = false; }
}

async function confirmImport() {
  if (!storageReadable.value || !pendingImport.value || importing.value || readingImport.value) return;
  importing.value = true; importError.value = '';
  try {
    // 用户确认也不等于成功：必须写入成功，才替换响应式数据并显示成功提示。
    const saved = await sync.save(pendingImport.value, localRevision, { importing: true });
    workbenchData.value = saved.data; localRevision = saved.revision;
    pendingImport.value = null; importOpen.value = false; importReadSequence++;
    notify('备份导入成功，当前记录已替换。');
  } catch (error) {
    importError.value = error.message || '导入未完成：浏览器保存失败，原记录保留。请检查本地存储是否可用。';
  } finally { importing.value = false; }
}
</script>

<template>
  <LaunchSplash v-if="showSplash" @finished="showReminders" />
  <main>
    <ReminderBanner :item="reminderBanner" :today="today" @acknowledge="acknowledgeReminder" />
    <SuccessMessages ref="successMessages" @locate="locateCompleted" />
    <header><SyncSymbol :snapshot="syncSnapshot" :status="syncStatus" :auth="cloudState.auth" :local-fallback="localFallback" /><span class="eyebrow">Personal Workbench</span><h1>欢迎回来，从哪里开始干活？</h1></header>
    <div v-if="needRefresh" class="notice">有新版本可用。<button @click="updateServiceWorker()">更新应用</button></div>
    <!-- 原首页继续使用同一个 v2 集合；所有者连接后八类事项由事务队列同步，未连接访客只保存本机。 -->
    <section class="routine-strip" aria-label="日常持续">
      <div class="routine-strip-head">
        <div class="routine-chips">
          <button v-for="(item, index) in routines" :key="item.id" :id="'item-' + item.id" :class="{located:highlighted === item.id}" type="button" class="routine-chip" :disabled="!canEditLocal" :aria-label="`编辑日常持续：${item.title}`" @click="openRoutineForm(item)">{{ item.title }}<span v-if="index < routines.length - 1" class="routine-separator" aria-hidden="true"> /</span></button>
          <span v-if="!routines.length" class="routine-empty">还没有日常提醒</span>
        </div>
        <button type="button" class="mini-add" :disabled="!canEditLocal" :aria-label="showRoutineForm ? '关闭日常持续编辑' : '添加日常持续'" :aria-expanded="showRoutineForm" @click="showRoutineForm ? requestRoutineClose() : openRoutineForm()">{{ showRoutineForm ? '×' : '+' }}</button>
      </div>
      <form v-if="showRoutineForm" class="routine-editor" @submit.prevent="saveRoutine">
        <label for="routine-title">名称</label>
        <input id="routine-title" v-model="routineTitle" maxlength="150" placeholder="添加一条日常提醒" :disabled="!canEditLocal">
        <div class="form-buttons">
          <button v-if="editingRoutineId" type="button" class="text-button danger delete-button" :disabled="!canEditLocal" @click="deleteRoutine(editingRoutineId)">删除</button>
          <button type="button" class="secondary" @click="requestRoutineClose">取消</button>
          <button :disabled="!canEditLocal">保存</button>
        </div>
      </form>
    </section>
    <!-- v-model 维护输入草稿；submit.prevent 阻止浏览器刷新页面，保存流程由 addTask 接管。 -->
    <form class="panel quick-form" @submit.prevent="addTask">
      <div class="quick-heading">
        <label for="task-title">快速记录</label>
        <QuickHelp>{{ quickType === 'default' ? '默认存入随笔；勾选“录入待办”后存入待办。' : '勾选“优先处理”会为所选分类的事项添加优先处理标记。' }}</QuickHelp>
      </div>
      <button type="button" class="text-button quick-tag-entry" :aria-expanded="tagPickerOpen" @click="tagPickerOpen = !tagPickerOpen">标签</button>
      <input id="task-title" v-model="title" maxlength="150" placeholder="记录一下..." :disabled="!canEditLocal">
      <div v-if="selectedQuickTags.length" class="quick-tag-selection" aria-label="本次记录标签"><button v-for="tag in selectedQuickTags" :key="tag" type="button" class="secondary" :aria-label="'移除标签 ' + tag" @click="removeQuickTag(tag)">#{{ tag }} ×</button></div>
      <div class="form-actions">
        <div class="quick-options">
          <label><input v-model="needProcessing" type="checkbox"> {{ quickType === 'default' ? '录入待办' : '优先处理' }}</label>
          <label v-if="quickType === 'default' && needProcessing"><input v-model="urgent" type="checkbox"> 急需处理</label>
        </div>
        <div class="quick-actions">
          <button type="button" class="text-button more-toggle" :aria-expanded="showMoreOptions" @click="toggleMoreOptions">{{ showMoreOptions ? '收起选项' : '更多选项' }}</button>
          <button :disabled="!canEditLocal">记录</button>
        </div>
      </div>
      <QuickTagPicker v-if="tagPickerOpen" :available="availableProjectTags" :selected="selectedQuickTags" @select="selectQuickTag" />
      <div v-if="showMoreOptions" class="more-options">
        <div class="quick-type-options" role="group" aria-label="记录类型">
          <button v-for="option in quickTypes" :key="option.type" type="button" :aria-pressed="quickType === option.type" @click="quickType = option.type; onQuickTypeChange()">{{ option.label }}</button>
          <button v-if="quickType !== 'default'" type="button" @click="quickType = 'default'; onQuickTypeChange()">清除选择</button>
        </div>
        <div v-if="quickType === 'waiting'" class="quick-reminder reminder-editor"><div class="reminder-field-head"><label for="quick-reminder-date">提醒</label><QuickHelp label="提醒说明">填写任务当天日期，提前一天转入待办并提醒。</QuickHelp></div><input id="quick-reminder-date" v-model="quickReminderDate" type="date" :disabled="!canEditLocal"></div>
        <label v-if="quickType === 'importantDate'" for="quick-target-date">目标日期</label>
        <input v-if="quickType === 'importantDate'" id="quick-target-date" v-model="quickTargetDate" type="date" :disabled="!canEditLocal">
      </div>
    </form>
    <p v-if="message" role="alert" class="error">{{ message }}</p>

    <section class="panel date-section" aria-label="重要日卡片">
      <div class="category-heading"><strong>重要日</strong><small>{{importantDates.length}} 个</small><SortToggle :active="sorting === 'importantDate'" @click="toggleSort('importantDate')" /><button class="mini-add" aria-label="添加重要日" @click="showImportantForm ? closeImportantForm() : showImportantForm=true">{{showImportantForm ? '×' : '+'}}</button></div>
      <SortList v-if="sorting === 'importantDate'" :items="importantDates" @move="moveRow" @pin="pinRow" @exit="sorting=null" />
      <ImportantDateDeck ref="dateDeck" v-else :highlighted="highlighted" :items="importantDates" :today="today" :can-edit="canEditLocal" @delete="deleteItem" />
      <form v-if="showImportantForm" class="date-form" @submit.prevent="addImportantDate">
        <label for="important-title">名称</label>
        <input id="important-title" v-model="importantTitle" maxlength="150" placeholder="例如：毕业纪念日" :disabled="!canEditLocal">
        <label for="important-date">目标日期</label>
        <input id="important-date" v-model="importantTargetDate" type="date" :disabled="!canEditLocal">
        <div class="form-buttons"><button type="button" class="secondary" @click="closeImportantForm">取消</button><button :disabled="!canEditLocal">保存</button></div>
      </form>
    </section>



    <section class="panel">
      <div class="category-heading">
        <button type="button" class="category-expand" :aria-expanded="showOpenTodos" :aria-label="`${showOpenTodos ? '收起' : '展开'}待办`" @click="toggleCategory('todo')"><CategoryChevron :expanded="showOpenTodos" /><span>待办</span><small v-if="!showOpenTodos">{{ openTodos.length }}</small></button>
        <SortToggle :active="sorting === 'todo'" @click="toggleSort('todo')" />
        <button type="button" class="mini-add" :disabled="!canEditLocal" :aria-label="addingCategory === 'todo' ? '关闭待办添加' : '添加待办'" @click="openCategoryForm('todo')">{{ addingCategory === 'todo' ? '×' : '+' }}</button>
      </div>
      <form v-if="addingCategory === 'todo'" class="category-add-form" @submit.prevent="addCategoryItem">
        <input id="todo-title" v-model="categoryTitle" aria-label="待办内容" maxlength="150" :disabled="!canEditLocal" placeholder="新待办">
        <div class="form-buttons"><button type="button" class="secondary" @click="openCategoryForm('todo')">取消</button><button :disabled="!canEditLocal">保存</button></div>
      </form>
      <p v-if="showOpenTodos && !openTodos.length" class="empty">这里暂时没有待办。</p>
      <SortList v-if="sorting === 'todo'" :items="sortRows('todo')" @move="moveRow" @pin="pinRow" @exit="sorting=null" />
      <OrdinaryItem v-else v-for="(task, index) in visibleOpenTodos" :key="task.id" :id="'item-' + task.id" :class="{located:highlighted === task.id}" @return-note="sendBack(task.id)" :ref="el=>registerEditor(task.id,el)" :item="task" :can-edit="canEditLocal" :expanded="selectedTodoId === task.id" :ellipsis="!showOpenTodos && openTodos.length > 2 && index === 1" :save-item="saveOrdinaryItem" @editing="protectOrdinary" @expand="expandOrdinary(task)" @complete="toggleTask(task.id)" @delete="deleteItem(task.id)" />
    </section>

    <template v-for="category in [categories[0], {type: 'project'}, ...categories.slice(1)]" :key="category.type">
    <section v-if="category.type === 'project'" class="panel project-section">
      <div class="category-heading">
        <button type="button" class="category-expand" :aria-expanded="showProjects" :aria-label="`${showProjects ? '收起' : '展开'}项目`" @click="projectPreview = false; showProjects = !showProjects"><CategoryChevron :expanded="showProjects" /><span>项目</span><small v-if="!showProjects">{{ projects.length }}</small></button>
        <SortToggle :active="sorting === 'project'" @click="toggleSort('project')" />
        <button type="button" class="mini-add" :disabled="!canEditLocal" :aria-label="addingCategory === 'project' ? '关闭项目添加' : '添加项目'" @click="openCategoryForm('project')">{{ addingCategory === 'project' ? '×' : '+' }}</button>
      </div>
      <ProjectCreate ref="projectCreate" v-if="addingCategory === 'project'" :can-edit="canEditLocal" :available-tags="availableProjectTags" :save-project="createFullProject" @close="addingCategory = null" />
      <p v-if="showProjects && !projects.length" class="empty">还没有项目</p>
      <SortList v-if="sorting === 'project'" :items="sortRows('project')" @move="moveRow" @pin="pinRow" @exit="sorting=null" />
      <article v-else v-for="(item, index) in visibleProjects" :key="item.id" :id="'item-' + item.id" class="category-row" :class="{paused:item.status==='paused',located:highlighted === item.id}">
        <div class="project-heading-row">
          <div class="item-line"><button type="button" class="category-title project-list-trigger" :aria-label="item.title ? undefined : '打开空名称项目详情'" :aria-expanded="selectedProjectId === item.id" @click="toggleProjectDetails(item.id)">{{ item.title }}<span v-for="tag in item.tags" :key="tag" class="project-user-tag">#{{ tag.replace(/^#+/, '') }}</span><span v-if="!showProjects && projects.length > 2 && index === 1" class="more-ellipsis" aria-hidden="true">……</span></button><span v-if="item.priority === true" class="urgent-mark item-status">优先处理</span></div>
          <div class="project-marks"><span v-if="item.status === 'paused'" class="paused-label">暂停中</span><PinnedMark :item="item" /></div>
        </div>
        <p class="project-next-step">{{ item.nextStep }}</p>
      </article>
    </section>
    <section v-else class="panel">
      <div class="category-heading">
        <button type="button" class="category-expand" :aria-expanded="expandedCategories[category.type]" :aria-label="`${expandedCategories[category.type] ? '收起' : '展开'}${category.label}`" @click="toggleCategory(category.type)">
          <CategoryChevron :expanded="expandedCategories[category.type]" /><span>{{ category.label }}</span><small v-if="!expandedCategories[category.type]">{{ categoryItems(category.type).length }}</small>
        </button>
        <SortToggle :active="sorting === category.type" @click="toggleSort(category.type)" />
        <button type="button" class="mini-add" :disabled="!canEditLocal" :aria-label="`${addingCategory === category.type ? '关闭' : '添加'}${category.label}`" @click="openCategoryForm(category.type)">{{ addingCategory === category.type ? '×' : '+' }}</button>
      </div>
      <form v-if="addingCategory === category.type" class="category-add-form" @submit.prevent="addCategoryItem">
        <input :id="`add-${category.type}`" v-model="categoryTitle" :aria-label="`${category.label}内容`" maxlength="150" :disabled="!canEditLocal" placeholder="写点什么...">
        <div class="form-buttons"><button type="button" class="secondary" @click="openCategoryForm(category.type)">取消</button><button :disabled="!canEditLocal">保存</button></div>
      </form>
      <p v-if="!categoryItems(category.type).length" class="empty">{{ category.type === 'note' ? '随手记下的内容会出现在这里。' : `还没有${category.label}记录。` }}</p>
      <SortList v-if="sorting === category.type" :items="sortRows(category.type)" @move="moveRow" @pin="pinRow" @exit="sorting=null" />
      <OrdinaryItem v-else v-for="(item, index) in visibleCategoryItems(category.type)" :key="item.id" :id="'item-' + item.id" :class="{located:highlighted === item.id}" :ref="el=>registerEditor(item.id,el)" :item="item" :can-edit="canEditLocal" :expanded="item.type === 'note' ? selectedNoteId === item.id : selectedDetailId === item.id" :ellipsis="!expandedCategories[category.type] && categoryItems(category.type).length > 2 && index === 1" :save-item="saveOrdinaryItem" @editing="protectOrdinary" @expand="expandOrdinary(item)" @complete="toggleTask(item.id)" @delete="deleteItem(item.id)">
        <form v-if="selectedNoteId === item.id && !item.convertedToId" class="conversion-form" @submit.prevent="saveNoteConversion">
          <label :for="`convert-${item.id}`">转成</label>
          <select :id="`convert-${item.id}`" v-model="conversionType">
            <option value="todo">待办</option><option value="project">项目</option>
            <option value="importantDate">重要日</option><option value="shopping">购物</option>
            <option value="waiting">等待中</option><option value="creation">娱乐/创作</option>
          </select>
          <label v-if="conversionType === 'importantDate'" :for="`convert-date-${item.id}`">目标日期</label>
          <input v-if="conversionType === 'importantDate'" :id="`convert-date-${item.id}`" v-model="conversionDate" type="date" :disabled="!canEditLocal">
          <div class="form-buttons"><button type="button" class="secondary" @click="selectedNoteId = null">取消</button><button :disabled="!canEditLocal">确认录入</button></div>
        </form>
      </OrdinaryItem>
    </section>

    </template>
    <!-- 父组件用稳定 id 作为 key，子组件发出事件后由父组件更新记录，不把数组序号当事项身份。 -->
    <section class="panel completed-section">
      <button id="completed-heading" type="button" class="category-expand" :aria-expanded="showCompleted" :aria-label="`${showCompleted ? '收起' : '展开'}已完成`" @click="toggleCategory('completed')"><CategoryChevron :expanded="showCompleted" /><span>已完成</span><small v-if="!showCompleted">{{ completedCount }}</small></button>
      <div v-if="showCompleted">
        <p v-if="!completedCount" class="empty">还没有已完成的事项。</p>
        <template v-for="item in visibleCompletedItems" :key="item.id">
        <OrdinaryItem v-if="item.type !== 'project'" :id="'completed-' + item.id" :class="{ located:highlighted === item.id }" :ref="el=>registerEditor(item.id,el)" :item="item" :can-edit="canEditLocal" :expanded="selectedTodoId === item.id" :save-item="saveOrdinaryItem" :save-favorite="saveFavorite" @editing="protectOrdinary" @expand="expandOrdinary(item)" @complete="toggleTask(item.id)" @delete="deleteItem(item.id)" />
        <article v-else :id="'completed-' + item.id" :class="{ located:highlighted === item.id }" class="category-row completed-project">
          <div class="project-heading-row">
            <div class="item-line"><button type="button" class="category-title project-list-trigger" :aria-label="item.title ? undefined : '打开已完成的空名称项目详情'" :aria-expanded="selectedProjectId === item.id" @click="toggleProjectDetails(item.id)">{{ item.title }}<span v-for="tag in item.tags" :key="tag" class="project-user-tag">#{{ tag.replace(/^#+/, '') }}</span></button><span v-if="item.priority === true" class="urgent-mark item-status">优先处理</span></div>
          </div>
          <p class="project-next-step">{{ item.nextStep }}</p>
        </article>
        </template>
        <div class="completed-actions">
          <button type="button" class="secondary" @click="collapseCompleted">收起已完成</button>
          <button v-if="completedLimit < completedCount" type="button" class="secondary" @click="completedLimit += 10">显示更多</button>
        </div>
      </div>
    </section>
    <footer class="workbench-footer">
      <div class="footer-row">
        <div class="footer-label">备份<QuickHelp label="备份说明">导出包含当前完整事项。导入会替换本机记录，已有同步绑定时不可整份替换。清除网站数据会删除本机记录和未补传修改。</QuickHelp></div>
        <div class="footer-actions"><button type="button" :disabled="!canEditLocal" @click="exportTasks">导出备份</button><button type="button" :disabled="!canEditLocal" aria-haspopup="dialog" @click="openImport">导入备份</button></div>
      </div>
      <p v-if="importError && !importOpen" class="error" role="alert">{{ importError }}</p>
      <div class="footer-row">
        <div class="footer-label">启动动画<QuickHelp label="启动动画说明">开关在下次进入时生效，每次会话播放一次。</QuickHelp></div>
        <div class="footer-actions"><button type="button" role="switch" aria-label="启动动画" :aria-checked="splashEnabled" @click="toggleSplashPreference">{{ splashEnabled ? '开启' : '关闭' }}</button></div>
      </div>
      <div class="footer-row theme-row">
        <span class="footer-label" id="theme-label">夜间模式</span>
        <div class="footer-actions theme-options" role="group" aria-labelledby="theme-label">
          <button v-for="option in [{ value: 'system', label: '跟随系统' }, { value: 'light', label: '日间' }, { value: 'dark', label: '夜间' }]" :key="option.value" type="button" :aria-pressed="themeMode === option.value" @click="selectTheme(option.value)">{{ option.label }}</button>
        </div>
      </div>
      <p v-if="themeError" class="error" role="alert">{{ themeError }}</p>
      <p v-if="splashPreferenceError" class="error" role="alert">{{ splashPreferenceError }}</p>
      <div class="footer-row">
        <div class="footer-label">云端连接<QuickHelp label="云端连接说明">云端仅供所有者连接。连接后，支持的事项会自动同步，日常无需手动上传；本机功能无需登录。</QuickHelp></div>
        <div class="footer-actions"><button type="button" :aria-expanded="cloudSettingsOpen" aria-controls="footer-cloud-settings" @click="cloudSettingsOpen = !cloudSettingsOpen">设置</button></div>
      </div>
      <div v-show="cloudSettingsOpen" id="footer-cloud-settings">
        <CloudConnection :offline-summary="repeatedOffline" :state="cloudState" @login="cloud.login()" @enable-write="cloud.login({ write: true })" @resume="cloud.resumeConnection()" @logout="cloud.logout" />
        <SyncSettings :suppress-status-message="repeatedOffline" :snapshot="syncSnapshot" :status="syncStatus" :connection="cloudState" :owner-phone="sync.ownerPhone" @enabled="sync.enabled" @resolve="sync.resolve" />
      </div>
      <div class="footer-row"><span class="footer-label">标签自动匹配</span><div class="footer-actions"><button type="button" aria-haspopup="dialog" @click="tagRulesOpen = true">设置</button></div></div>
      <p v-if="tagRulesError" class="error" role="alert">{{ tagRulesError }}</p>
      <GlobalSearch :items="personalItems" :message="searchMessage" @locate="locateSearch" />
    </footer>
    <TagRuleSettings v-if="tagRulesOpen" :rules="tagRules" :available="availableProjectTags" :save-rules="saveTagRules" @close="tagRulesOpen = false" />
    <ProjectCard v-if="importOpen" title="导入备份确认" :request-close="cancelImport">
      <p>导入会用备份内容覆盖本机全部记录，请先保留当前备份。</p>
      <label for="backup-file">选择 JSON 备份</label><input ref="backupInput" id="backup-file" type="file" accept=".json,application/json" :disabled="importing" @change="chooseBackup">
      <p v-if="readingImport" role="status">正在校验备份…</p>
      <template v-if="pendingImport"><p>文件：{{ pendingFileName }}</p><p>备份 {{ pendingImport.items.length }} 条，现有 {{ workbenchData.items.length }} 条。</p></template>
      <p v-if="importBound">已有同步绑定。整份替换可能影响已同步记录，因此不能确认替换；原记录和待同步修改保持不变。</p>
      <p v-else>确认后将用备份替换本机全部记录，请先保留当前备份。</p>
      <p v-if="importError" class="error" role="alert">{{ importError }}</p>
      <div class="form-buttons"><button type="button" class="secondary" :disabled="importing" @click="cancelImport">取消</button><button type="button" :disabled="importBound || !canEditLocal || importing || readingImport || !pendingImport" @click="confirmImport">确认替换</button></div>
    </ProjectCard>
    <ProjectDialog v-if="selectedProject" ref="projectDialog" :key="selectedProject.id" :project="selectedProject" :can-edit="canEditLocal" :available-tags="availableProjectTags" :save-project="saveProject" :save-favorite="saveFavorite" :delete-project="deleteItem" @close="selectedProjectId = null" />
  </main>
</template>
