<script setup>
import { computed } from 'vue';
const props = defineProps({ state: { type: Object, required: true } });
defineEmits(['source', 'login', 'logout', 'refresh']);
const busy = computed(() => ['checking', 'authorizing'].includes(props.state.auth.state));
const labels = { checking: '恢复连接中', authorizing: '等待授权', connected: '已连接 · 只读', disconnected: '未连接', expired: '授权已到期', offline: '离线／连接待恢复', error: '连接未完成' };
const lastRead = computed(() => props.state.lastReadAt === null ? '尚未成功读取' : new Date(props.state.lastReadAt).toLocaleString());
</script>

<template>
  <section class="panel cloud-connection" aria-label="数据来源与云端连接">
    <div class="cloud-connection-head">
      <div class="source-buttons" role="group" aria-label="数据来源">
        <button type="button" :class="{ secondary: state.source !== 'local' }" :aria-pressed="state.source === 'local'" @click="$emit('source', 'local')">本机数据</button>
        <button type="button" :class="{ secondary: state.source !== 'cloud' }" :aria-pressed="state.source === 'cloud'" @click="$emit('source', 'cloud')">云端测试</button>
      </div>
      <span class="connection-label" role="status">{{ labels[state.auth.state] || '未连接' }}</span>
    </div>
    <p>{{ state.source === 'local' ? '当前设备的事项照常使用，无需登录。' : '云端为独立只读测试视图，不会替换当前设备的事项。' }}</p>
    <div class="cloud-actions">
      <button v-if="state.auth.state !== 'connected'" class="secondary" type="button" :disabled="busy" @click="$emit('login')">{{ state.auth.state === 'expired' ? '重新授权' : '登录云端' }}</button>
      <button v-if="state.auth.remembered || state.auth.state === 'connected' || state.auth.state === 'error'" class="secondary" type="button" @click="$emit('logout')">退出云端</button>
      <button class="secondary" type="button" :disabled="state.source !== 'cloud' || state.readState === 'loading' || (!state.auth.remembered && state.auth.state !== 'connected')" @click="$emit('refresh')">{{ state.readState === 'loading' ? '正在读取…' : '重新读取' }}</button>
    </div>
    <p class="cloud-note">{{ state.auth.message }}</p>
    <p v-if="state.source === 'cloud'" class="cloud-note">最后成功读取：{{ lastRead }}。返回前台或恢复联网时会尝试读取；不自动写入。</p>
    <p v-if="state.message" class="cloud-message" role="status">{{ state.message }}</p>
    <p v-if="state.stale" class="cloud-stale" role="status">离线／内容可能已过期。下面保留的是此前成功读取的快照。</p>
  </section>
</template>
