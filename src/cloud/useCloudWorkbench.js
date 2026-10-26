import { shallowRef, onBeforeUnmount } from 'vue';
import { createCloudAuth, captureOAuthCallback } from './cloudAuth.js';
import { createWorkbenchApi } from './workbenchApi.js';
import { createCloudController } from './cloudController.js';

const auth = createCloudAuth();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('personal-workbench.cloud-connection.v1') : null;
export const cloudWorkbench = createCloudController({
  auth, api: createWorkbenchApi({ auth }),
  // 消息只传退出事件，绝不传令牌或事项正文。
  announceLogout: () => channel?.postMessage('logout'),
});
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
    channel?.close(); cloudWorkbench.stop();
  });
}

export function useCloudWorkbench() {
  const state = shallowRef(cloudWorkbench.getState());
  const unsubscribe = cloudWorkbench.subscribe(next => { state.value = next; });
  onBeforeUnmount(unsubscribe);
  return { state, ...cloudWorkbench };
}
