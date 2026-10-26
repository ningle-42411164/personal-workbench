import { CloudError, connectionError } from './cloudConfig.js';

// 本机数据不在这个控制器里；来源切换只控制云端请求和独立测试视图。
export function createCloudController({ auth, api, now = Date.now, isOnline = () => globalThis.navigator?.onLine !== false, navigate = url => window.location.assign(url), announceLogout = () => {} }) {
  let state = { source: 'local', auth: auth.getStatus(), items: [], readState: 'idle', stale: false, lastReadAt: null, message: '' };
  let epoch = 0;
  let reading;
  let request;
  let lastReadStartedAt = -Infinity;
  const listeners = new Set();
  function publish(patch) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); }
  function cancelRead() { epoch++; request?.abort(); reading = undefined; }
  const unsubscribe = auth.subscribe(next => {
    publish({ auth: next });
    if (next.state === 'connected' && state.source === 'cloud') void refresh('auto');
  });
  async function refresh(reason = 'manual') {
    if (state.source !== 'cloud') return;
    if (!isOnline()) { offline(); return; }
    if (reading) return reading;
    if (reason === 'auto' && now() - lastReadStartedAt < 1500) return;
    lastReadStartedAt = now();
    const start = epoch;
    request = new AbortController();
    const signal = request.signal;
    publish({ readState: 'loading', message: '' });
    const operation = (async () => {
      try {
        const items = await api.listItems(signal);
        if (start !== epoch || signal.aborted || state.source !== 'cloud') return;
        publish({ items, readState: 'ready', stale: false, lastReadAt: now(), message: '' });
      } catch (error) {
        if (start !== epoch || signal.aborted || error?.name === 'AbortError') return;
        const failure = connectionError(error);
        publish({ readState: failure.kind === 'login' ? 'login' : 'failed', stale: state.lastReadAt !== null, message: failure.message });
      }
    })();
    reading = operation;
    try { return await operation; }
    finally { if (reading === operation) reading = undefined; }
  }
  function selectSource(source) {
    if (!['local', 'cloud'].includes(source) || state.source === source) return;
    cancelRead();
    publish({ source, readState: state.lastReadAt === null ? 'idle' : 'ready', message: '' });
    if (source === 'cloud' && (state.auth.state === 'connected' || state.auth.remembered)) void refresh();
  }
  async function start(callback) {
    if (callback) publish({ source: 'cloud' });
    try { callback ? await auth.finish(callback) : await auth.restore(); }
    catch (error) { if (error?.name !== 'AbortError') publish({ message: connectionError(error).message }); }
  }
  async function login(options) {
    cancelRead();
    try { const url = await auth.login(options); navigate(url); }
    catch (error) { if (error?.name !== 'AbortError') publish({ message: connectionError(error).message }); }
  }
  async function logout() {
    cancelRead();
    const start = epoch;
    publish({ items: [], readState: 'idle', stale: false, lastReadAt: null, message: '正在退出云端连接。' });
    announceLogout();
    try { const result = await auth.logout(); if (start === epoch && !result.obsolete) publish({ message: result.message }); }
    catch { if (start === epoch) publish({ message: '本机视图已清除，但连接存储未能清理。请检查存储设置后再次退出。' }); }
  }
  function externalLogout() {
    cancelRead(); auth.invalidate();
    publish({ items: [], readState: 'idle', stale: false, lastReadAt: null, message: '已在另一个窗口退出连接。' });
  }
  function offline() {
    if (state.source !== 'cloud') return;
    cancelRead();
    // 离线打断后，真正恢复联网的第一次读取不被此前成功请求的短时去抖吞掉。
    lastReadStartedAt = -Infinity;
    publish({ readState: 'failed', stale: state.lastReadAt !== null, message: '离线／内容可能已过期。联网后可重新读取；本批没有离线写入。' });
  }
  async function refreshAfterWrite() {
    // 保存前已发出的 GET 不能冒充保存后的确认读取。
    if (reading) await reading;
    return refresh('manual');
  }
  return {
    start, login, logout, refresh, refreshAfterWrite, selectSource, externalLogout, offline,
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    stop() { cancelRead(); unsubscribe(); listeners.clear(); },
  };
}
