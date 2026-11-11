// 一个调度器协调授权恢复与同步；3 秒只提示，不取消仍在执行的请求。
export function createConnectionRecovery({ auth, onFallback = () => {}, schedule = setTimeout, cancel = clearTimeout, visible = () => true } = {}) {
  let running, timer, noticeTimer, stopped = false, failures = 0, notified = false, pendingWake = false;
  let synchronize = async () => ({ phase: 'paused' });
  function fallback() {
    if (notified || (!auth.getStatus().remembered && auth.getStatus().state !== 'expired')) return;
    notified = true;
    onFallback();
  }
  async function run(force = false) {
    if (stopped || !visible()) return;
    if (running) return running;
    cancel(timer);
    let retry = false, connected = false;
    noticeTimer = schedule(fallback, 3000);
    const operation = Promise.resolve().then(async () => {
      try {
        await auth.restore(force || failures > 0);
        if (stopped) return;
        const status = auth.getStatus();
        if (status.state !== 'connected') {
          if (status.remembered && !['expired', 'disconnected', 'signingout'].includes(status.state)) {
            throw new Error('连接尚未恢复');
          }
          if (status.state === 'expired') fallback();
          return;
        }
        // 授权恢复不代表同步请求已得到有效响应；计时覆盖同步等待，统一在 finally 清理。
        const result = await synchronize();
        if (['failed', 'offline'].includes(result?.phase)) throw new Error('同步连接暂不可用');
        if (['login', 'permission'].includes(result?.phase)) { fallback(); return; }
        connected = true;
        failures = 0;
        notified = false;
      } catch (error) {
        if (error?.name === 'AbortError' || stopped) return;
        fallback();
        retry = auth.getStatus().remembered && !['expired', 'disconnected', 'signingout'].includes(auth.getStatus().state);
        if (retry) failures++;
      }
    });
    running = operation;
    try { await operation; }
    finally {
      cancel(noticeTimer);
      if (running === operation) running = undefined;
      if (!stopped && (retry || connected)) {
        timer = schedule(() => { void run(); }, retry ? Math.min(20000, 5000 * 2 ** Math.min(failures - 1, 2)) : pendingWake ? 0 : 30000);
      }
      pendingWake = false;
    }
  }
  return {
    run,
    setSynchronize(callback) { synchronize = callback; },
    wake() { if (running) { pendingWake = true; return; } if (!stopped) { cancel(timer); timer = schedule(() => { void run(); }, 250); } },
    stop() { stopped = true; cancel(timer); cancel(noticeTimer); },
  };
}
