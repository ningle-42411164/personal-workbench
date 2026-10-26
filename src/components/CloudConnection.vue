<script setup>
import { computed, ref } from 'vue';
import { needsBrowserConnection, browserConnectionUrl } from '../cloud/browserConnection.js';
const props = defineProps({ state: { type: Object, required: true } });
const emit = defineEmits(['source', 'login', 'logout', 'refresh', 'enable-write', 'resume']);
const standalone = needsBrowserConnection();
const browserHandoff = ref(false);
function requestLogin(write = false) {
  // 不从已知丢 cookie 的安装上下文再次启动授权；只引导一次普通浏览器连接。
  if (standalone) { browserHandoff.value = true; return; }
  emit(write ? 'enable-write' : 'login');
}
const busy = computed(() => ['checking', 'authorizing', 'signingout'].includes(props.state.auth.state));
const labels = { checking: '恢复连接中', authorizing: '等待授权', signingout: '正在退出', connected: '已连接', disconnected: '未连接', expired: '授权已到期', offline: '离线／连接待恢复', error: '连接未完成' };
const lastRead = computed(() => props.state.lastReadAt === null ? '尚未成功读取' : new Date(props.state.lastReadAt).toLocaleString());
</script>

<template>
  <section class="panel cloud-connection" aria-label="数据来源与云端连接">
    <div class="cloud-connection-head">
      <div class="source-buttons" role="group" aria-label="数据来源">
        <button type="button" :class="{ secondary: state.source !== 'local' }" :aria-pressed="state.source === 'local'" @click="$emit('source', 'local')">本机数据</button>
        <button type="button" :class="{ secondary: state.source !== 'cloud' }" :aria-pressed="state.source === 'cloud'" @click="$emit('source', 'cloud')">云端测试</button>
      </div>
      <span class="connection-label" role="status">{{ labels[state.auth.state] || '未连接' }}{{ state.auth.state === 'connected' ? (state.auth.canWrite ? ' · 测试读写' : ' · 只读') : '' }}</span>
    </div>
    <p>{{ state.source === 'local' ? '当前设备的事项照常使用，无需登录。自动同步在下方单独开启。' : '此页为独立云端测试视图。正常首页的自动同步在下方设置，已有本机事项需预览确认后才纳入。' }}</p>
    <div class="cloud-actions">
      <button v-if="state.auth.state !== 'connected'" class="secondary" type="button" :disabled="busy" @click="requestLogin()">{{ state.auth.state === 'expired' ? '重新授权' : '登录云端' }}</button>
      <button v-if="state.source === 'cloud' && !state.auth.canWrite" class="secondary" type="button" :disabled="busy" @click="requestLogin(true)">授权云端测试写入</button>
      <button v-if="state.auth.remembered || state.auth.state === 'connected' || state.auth.state === 'error'" class="secondary" type="button" @click="$emit('logout')">退出云端</button>
      <button class="secondary" type="button" :disabled="state.source !== 'cloud' || state.readState === 'loading' || (!state.auth.remembered && state.auth.state !== 'connected')" @click="$emit('refresh')">{{ state.readState === 'loading' ? '正在读取…' : '重新读取' }}</button>
    </div>
    <div v-if="browserHandoff" class="cloud-message" role="status">
      <p>桌面入口首次连接或增加权限，请在 Edge 普通浏览器完成，避免授权页丢失浏览器绑定。完成后返回这里检查连接，后续打开会自动恢复。</p>
      <p><a :href="browserConnectionUrl" target="_blank" rel="noopener noreferrer">打开普通浏览器连接入口</a></p>
      <p>若打开后仍没有地址栏，请在 Edge 浏览器地址栏输入：{{ browserConnectionUrl }}。展开页尾“云端连接”，切到云端测试并完成所需授权。</p>
      <button type="button" class="secondary" :disabled="busy" @click="$emit('resume')">已在浏览器完成，检查连接</button>
    </div>
    <p class="cloud-note">{{ state.auth.message }}</p>
    <p v-if="state.source === 'cloud'" class="cloud-note">测试视图最后成功读取：{{ lastRead }}。返回前台或恢复联网时会尝试读取；此视图的写入仍需确认。</p>
    <p v-if="state.message" class="cloud-message" role="status">{{ state.message }}</p>
    <p v-if="state.stale" class="cloud-stale" role="status">离线／内容可能已过期。下面保留的是此前成功读取的快照。</p>
  </section>
</template>
