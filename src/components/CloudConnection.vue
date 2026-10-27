<script setup>
import { computed, ref } from 'vue';
import { needsBrowserConnection, browserConnectionUrl } from '../cloud/browserConnection.js';
const props = defineProps({ state: { type: Object, required: true } });
const emit = defineEmits(['login', 'logout', 'enable-write', 'resume']);
const standalone = needsBrowserConnection();
const browserHandoff = ref(false);
function requestLogin(write = false) {
  // 不从已知丢 cookie 的安装上下文再次启动授权；只引导一次普通浏览器连接。
  if (standalone) { browserHandoff.value = true; return; }
  emit(write ? 'enable-write' : 'login');
}
const busy = computed(() => ['checking', 'authorizing', 'signingout'].includes(props.state.auth.state));
const labels = { checking: '恢复连接中', authorizing: '等待授权', signingout: '正在退出', connected: '已连接', disconnected: '未连接', expired: '授权已到期', offline: '离线／连接待恢复', error: '连接未完成' };
</script>

<template>
  <section class="panel cloud-connection" aria-label="云端连接">
    <div class="cloud-connection-head">
      <span class="connection-label" role="status">{{ labels[state.auth.state] || '未连接' }}{{ state.auth.state === 'connected' ? (state.auth.canWrite ? ' · 读写' : ' · 只读') : '' }}</span>
    </div>
    <p>本机功能任何访客均可使用，无需登录。云端仅供工作台所有者连接；所有者已连接后，八类事项自动同步。</p>
    <div class="cloud-actions">
      <button v-if="state.auth.state !== 'connected'" class="secondary" type="button" :disabled="busy" @click="requestLogin()">{{ state.auth.state === 'expired' ? '所有者重新授权' : '所有者连接云端' }}</button>
      <button v-if="state.auth.state === 'connected' && !state.auth.canWrite" class="secondary" type="button" :disabled="busy" @click="requestLogin(true)">增加写入权限</button>
      <button v-if="state.auth.remembered || state.auth.state === 'connected' || state.auth.state === 'error'" class="secondary" type="button" @click="$emit('logout')">退出云端</button>
      <button class="secondary" type="button" :disabled="busy || (!state.auth.remembered && state.auth.state !== 'connected')" @click="$emit('resume')">检查连接</button>
    </div>
    <div v-if="browserHandoff" class="cloud-message" role="status">
      <p>桌面入口首次连接或增加权限，请在 Edge 普通浏览器完成，避免授权页丢失浏览器绑定。完成后返回这里检查连接，后续打开会自动恢复。</p>
      <p><a :href="browserConnectionUrl" target="_blank" rel="noopener noreferrer">打开普通浏览器连接入口</a></p>
      <p>若打开后仍没有地址栏，请在 Edge 浏览器地址栏输入：{{ browserConnectionUrl }}。展开页尾“云端连接”完成所需授权。</p>
      <button type="button" class="secondary" :disabled="busy" @click="$emit('resume')">已在浏览器完成，检查连接</button>
    </div>
    <p class="cloud-note">{{ state.auth.message }}</p>
    <p v-if="state.message" class="cloud-message" role="status">{{ state.message }}</p>
  </section>
</template>
