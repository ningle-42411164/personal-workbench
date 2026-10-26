import { shallowRef, onBeforeUnmount } from 'vue';
import { createSyncStore } from './syncStore.js';
import { createSyncApi } from './syncApi.js';
import { createSyncEngine } from './syncEngine.js';
import { sharedCloudAuth } from '../cloud/useCloudWorkbench.js';

export function useSyncWorkbench() {
  const snapshot = shallowRef(null);
  const status = shallowRef({ phase: 'starting', message: '正在读取本机数据。', lastSuccess: null });
  const store = createSyncStore();
  const api = createSyncApi({ auth: sharedCloudAuth });
  const engine = createSyncEngine({ store, api, onStatus: next => { status.value = { ...status.value, ...next }; } });
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('personal-workbench.sync.v1') : null;
  const unsubscribe = store.subscribe(next => { snapshot.value = next; channel?.postMessage('changed'); });
  const fail = error => { status.value = { ...status.value, phase: 'failed', message: error.message || '同步暂不可用，本机内容保留。' }; };
  if (channel) channel.onmessage = async event => {
    if (event.data !== 'changed') return;
    try { snapshot.value = await store.read(); engine.wake(); } catch (error) { fail(error); }
  };
  let previouslyConnected = sharedCloudAuth.getStatus().state === 'connected';
  const unsubscribeAuth = sharedCloudAuth.subscribe(next => {
    // restore 在本来就没登录时也会发布 disconnected，不能因此取消自身的错误提示。
    if (next.state === 'signingout' || previouslyConnected && ['disconnected', 'expired'].includes(next.state)) {
      engine.interrupt(); status.value = { ...status.value, phase: 'login', message: '连接已退出或失效，本机修改保留；重新登录后自动继续。' };
    }
    if (['disconnected', 'expired'].includes(next.state)) previouslyConnected = false;
    if (next.state === 'connected') { previouslyConnected = true; engine.wake(); }
  });
  const resume = async () => {
    if (document.visibilityState === 'hidden') return;
    try { snapshot.value = await store.read(); engine.wake(); } catch (error) { fail(error); }
  };
  const offline = () => { engine.interrupt(); status.value = { ...status.value, phase: 'offline', message: '离线：本机可以继续编辑，联网后自动补传。' }; };
  window.addEventListener('online', resume);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', resume);
  onBeforeUnmount(() => {
    engine.stop(); unsubscribe(); unsubscribeAuth(); channel?.close();
    window.removeEventListener('online', resume); window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', resume); void store.close();
  });
  return {
    snapshot, status,
    async initialize() { snapshot.value = await store.read(); engine.wake(); return snapshot.value; },
    async save(data, revision, options) { const saved = await store.save(data, revision, options); engine.wake(); return saved; },
    async enabled(value) {
      engine.interrupt();
      try { snapshot.value = await store.setEnabled(value); if (!value) status.value = { ...status.value, phase: 'paused', message: '自动同步已暂停，本机编辑与待同步修改继续保留。' }; engine.wake(); } catch (error) { fail(error); }
    },
    async enroll({ ids, revision }) {
      try { snapshot.value = await store.enroll(ids, revision); engine.wake(); } catch (error) { fail(error); }
    },
    async resolve(id) {
      try { snapshot.value = await store.resolveWithCopy(id, snapshot.value.revision); engine.wake(); } catch (error) { fail(error); }
    },
  };
}
