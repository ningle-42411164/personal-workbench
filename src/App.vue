<script setup>
import { ref, computed } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import LaunchSplash from './components/LaunchSplash.vue';
import { createTodo, emptyWorkbenchData, readWorkbenchData, toggleTodo, validateWorkbenchData, writeWorkbenchData } from './data/workbenchData.js';

const workbenchData = ref(emptyWorkbenchData());
const tasks = computed(() => workbenchData.value.items.filter(item => item.type === 'todo'));
const title = ref('');//保存输入框当前的文字。
const urgent = ref(false);//保存“急需处理”复选框是否勾选。
const message = ref('');//保存需要展示给用户的错误提示
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

const groups = computed(() => [
  { name: '急需处理', items: tasks.value.filter(task => !task.done && task.urgent) },
  { name: '没那么急但要做', items: tasks.value.filter(task => !task.done && !task.urgent) },
  { name: '已完成', items: tasks.value.filter(task => task.done) },
]);

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

//创建新任务task后，把新任务和旧任务（...tasks.value）一起丢给saveTasks保存到浏览器
function addTask() {
  if (!title.value.trim()) { message.value = '请先填写任务标题。'; return; }//非空字符串在 JS 里算 true,trim()删掉了title.value两端的空格之后，再！判断是否ture
  const task = createTodo(title.value.trim(), urgent.value);
  if (saveTasks([...tasks.value, task])) { title.value = ''; urgent.value = false; }//把旧，新任务丢上浏览器保存后清空输入框
}

//切换完成状态，id 是操作目标传进来的参数
function toggleTask(id) {
  saveTasks(tasks.value.map(task => task.id === id ? toggleTodo(task) : task));
}
// { ...task }展开task属性；完成状态与完成时间一起改变。

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
    <header><span>PERSONAL WORKBENCH · 起步版</span><h1>我的工作台</h1><p>欢迎回来，从哪里开始干活？</p></header>
    <p v-if="offlineReady" class="notice" role="status">页面已缓存，可以断网使用。任务保存在当前设备。</p>
    <div v-if="needRefresh" class="notice">有新版本可用。<button @click="updateServiceWorker()">更新应用</button></div>
    <form @submit.prevent="addTask">
      <label for="task-title">添加一件要做的事</label>
      <input id="task-title" v-model="title" maxlength="150" placeholder="例如：完成今天的 Vue 练习" :disabled="!storageReadable">
      <div class="form-actions"><label><input v-model="urgent" type="checkbox"> 急需处理</label><button :disabled="!storageReadable">添加任务</button></div>
    </form>
    <p v-if="message" role="alert" class="error">{{ message }}</p>
    <section v-for="group in groups" :key="group.name">
      <h2>{{ group.name }} <small>{{ group.items.length }}</small></h2>
      <p v-if="!group.items.length" class="empty">这里暂时没有任务。</p>
      <label v-for="task in group.items" :key="task.id" class="task" :class="{ completed: task.done }">
        <input type="checkbox" :checked="task.done" :disabled="!storageReadable" @change="toggleTask(task.id)">
        <span>{{ task.title }}</span>
      </label>
    </section>
    <footer>
      <button class="secondary" :disabled="!storageReadable" @click="exportTasks">导出任务备份</button>
      <label class="backup-label" for="backup-file">导入备份（JSON 文件）</label>
      <input id="backup-file" type="file" accept=".json,application/json" :disabled="!storageReadable" @change="chooseBackup">
      <p>导入会替换当前全部记录，请先导出当前备份。备份仅在当前设备／浏览器处理，不涉及云同步。清除网站数据会删除本地记录。</p>
      <div v-if="pendingImport" class="import-confirm" role="alert">
        <p>“{{ pendingFileName }}”校验通过：将用 {{ pendingImport.items.length }} 条记录替换当前 {{ tasks.length }} 条记录。确定导入吗？</p>
        <div class="import-actions">
          <button @click="confirmImport">确认替换</button>
          <button class="secondary" @click="pendingImport = null">取消</button>
        </div>
      </div>
    </footer>
  </main>
</template>
