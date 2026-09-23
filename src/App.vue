<script setup>
import { ref, computed } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';

const storageKey = 'personal-workbench.tasks.v1';
const tasks = ref([]);
const title = ref('');//保存输入框当前的文字。
const urgent = ref(false);//保存“急需处理”复选框是否勾选。
const message = ref('');//保存需要展示给用户的错误提示
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW();

// 浏览器保存的数据需要先校验，读取失败时不能悄悄覆盖旧数据。
const storageReadable = ref(true);
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(saved) || saved.some(task => !task || typeof task.id !== 'string' || typeof task.title !== 'string' || typeof task.done !== 'boolean' || typeof task.urgent !== 'boolean')) {
    throw new Error('任务格式不正确');//排查到错误了直接跳下面的catch
  }
  tasks.value = saved;//正常情况下才会执行这个
} catch {
  storageReadable.value = false;
  message.value = '本地数据读取失败，已暂停修改以保护原数据。';
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
    localStorage.setItem(storageKey, JSON.stringify(nextTasks));//把next转化成字符串格式然后保存到浏览器上面
    tasks.value = nextTasks;//更新数据库（？）
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
  const task = { id: crypto.randomUUID(), title: title.value.trim(), urgent: urgent.value, done: false };
  if (saveTasks([...tasks.value, task])) { title.value = ''; urgent.value = false; }//把旧，新任务丢上浏览器保存后清空输入框
}

//切换完成状态，id 是操作目标传进来的参数
function toggleTask(id) {
  saveTasks(tasks.value.map(task => task.id === id ? { ...task, done: !task.done } : task));
}
// { ...task, done: !task.done }展开task属性，后半段意思是把done属性置反再覆盖进task里面

//导出任务备份
function exportTasks() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(tasks.value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'workbench-tasks.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<template>
  <main>
    <header><span>PERSONAL WORKBENCH · 起步版</span><h1>我的工作台</h1><p>事情越干越多······</p></header>
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
    <footer><button class="secondary" @click="exportTasks">导出任务备份</button><p>数据仅保存在当前浏览器，尚未云端同步。清除网站数据会删除本地记录，请定期导出。</p></footer>
  </main>
</template>
