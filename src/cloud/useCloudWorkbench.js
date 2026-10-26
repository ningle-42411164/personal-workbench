import { shallowRef, onBeforeUnmount } from 'vue';
import { createCloudAuth, captureOAuthCallback } from './cloudAuth.js';
import { createWorkbenchApi } from './workbenchApi.js';
import { createCloudController } from './cloudController.js';
import { createCloudWrites } from './cloudWrites.js';

const auth = createCloudAuth();
const api = createWorkbenchApi({ auth });
// 同一公共客户端会话供测试视图和正常首页同步使用，令牌仍由 auth 管理。
export { auth as sharedCloudAuth };
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('personal-workbench.cloud-connection.v1') : null;
export const cloudWorkbench = createCloudController({
  auth, api,
  // 消息只传退出事件，绝不传令牌或事项正文。
  announceLogout: () => channel?.postMessage('logout'),
});
let draftStorage;
try { draftStorage = globalThis.sessionStorage; } catch { /* 禁用存储时保留内存草稿。 */ }
export const cloudWrites = createCloudWrites({ api, cloud: cloudWorkbench, storage: draftStorage });
if (channel) channel.onmessage = event => { if (event.data === 'logout') cloudWorkbench.externalLogout(); };

export function prepareCloudCallback() { return captureOAuthCallback(window.location, window.history); }
export function startCloudConnection(callback) {
  const visible = () => { if (document.visibilityState === 'visible') void cloudWorkbench.refresh('auto'); };
  const online = () => { void cloudWorkbench.refresh('auto'); };
  const offline = () => cloudWorkbench.offline();
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  void cloudWorkbench.start(callback);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    channel?.close(); cloudWrites.stop(); cloudWorkbench.stop();
  });
}

export function useCloudWorkbench() {
  const state = shallowRef(cloudWorkbench.getState());
  const writes = shallowRef(cloudWrites.getState());
  const unsubscribe = cloudWorkbench.subscribe(next => { state.value = next; });
  const unsubscribeWrites = cloudWrites.subscribe(next => { writes.value = next; });
  onBeforeUnmount(() => { unsubscribe(); unsubscribeWrites(); });
  return { state, writes, writer: cloudWrites, ...cloudWorkbench };
}
