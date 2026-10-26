<script setup>
defineProps({ state: { type: Object, required: true } });
defineEmits(['edit-project']);
const types = { project: '项目', todo: '一次性待办', note: '随笔', routine: '日常持续', importantDate: '重要日', waiting: '等待中', shopping: '购物', creation: '娱乐/创作' };
const statuses = { active: '进行中', paused: '暂停中', done: '已完成' };
</script>

<template>
  <section class="panel cloud-readonly" aria-label="云端测试事项">
    <div class="cloud-list-heading"><h2>云端测试事项</h2><span>{{ state.lastReadAt === null ? '尚未读取' : `${state.items.length} 条快照` }}</span></div>
    <p class="cloud-note">列表展示服务端快照；已授权时可编辑项目。普通事项编辑、完成、恢复、删除尚未接入。</p>
    <p v-if="state.readState === 'ready' && !state.items.length">云端读取成功，目前没有事项。</p>
    <p v-else-if="!state.items.length && state.readState === 'loading'" role="status">正在读取云端事项…</p>
    <p v-else-if="!state.items.length && state.readState !== 'ready'">尚无成功读取的云端内容。请先登录，再重新读取；读取失败不代表云端为空。</p>
    <article v-for="record in state.items" :key="record.item.id" class="cloud-record">
      <div class="cloud-record-heading"><h3>{{ record.item.title }}</h3><span>{{ types[record.item.type] || record.item.type }} · v{{ record.version }}</span></div>
      <p v-if="record.item.type === 'project'">状态：{{ statuses[record.item.status] || '未设置' }}</p>
      <p v-if="record.item.type === 'project'"><strong>当前情况：</strong>{{ record.item.currentSituation || '未填写' }}</p>
      <p v-if="record.item.type === 'project'"><strong>下一步：</strong>{{ record.item.nextStep || '未填写' }}</p>
      <p v-if="record.item.type === 'project'">开始：{{ record.item.startDate || '未设置' }} · 截止：{{ record.item.dueDate || '未设置' }}</p>
      <p v-if="record.item.targetDate">目标日期：{{ record.item.targetDate }}</p>
      <p v-if="record.item.done">已完成</p>
      <p v-if="record.item.tags?.length" class="cloud-note">{{ record.item.tags.map(tag => `#${tag}`).join(' ') }}</p>
      <details v-if="record.item.updates?.length"><summary>查看项目历史（{{ record.item.updates.length }} 条）</summary><ol><li v-for="update in record.item.updates" :key="update.id">{{ update.content }} <time>{{ new Date(update.createdAt).toLocaleString() }}</time></li></ol></details>
      <button v-if="record.item.type === 'project' && state.auth.canWrite" type="button" class="secondary" @click="$emit('edit-project', record.item.id)">编辑云端项目</button>
    </article>
  </section>
</template>
