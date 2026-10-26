// 每次网络发送使用已经落盘的不可变请求；响应丢失、刷新或另一个窗口重试均复用它。
// 定时器只负责页面打开时的同步，不承诺手机关闭应用后仍在后台联网。
export function createSyncEngine({ store, api, isOnline = () => globalThis.navigator?.onLine !== false, onStatus = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let running, timer, stopped = false, failures = 0, generation = 0, request;
  const publish = (phase, message, extra = {}) => onStatus({ phase, message, ...extra });
  async function run() {
    if (stopped) return;
    if (running) return running;
    cancel(timer);
    const start = generation;
    request = new AbortController();
    const active = () => start === generation && !stopped;
    const signal = request.signal;
    const operation = (async () => {
      try {
        let state = await store.read();
        if (!state.enabled) { publish('paused', '自动同步未开启；本机仍可编辑。'); return; }
        if (!isOnline()) { publish('offline', '离线：修改已保存在本机，联网后自动继续。'); return; }
        publish('syncing', '正在同步…');
        for (let count = 0; count < 100 && active(); count++) {
          const job = await store.prepare();
          if (!job) break;
          try {
            const result = await api.send(job, signal);
            if (!active()) return;
            await store.acknowledge(job, result, active);
          } catch (error) {
            if (!active()) return;
            if (error.kind === 'conflict') {
              const remote = await api.get(job.id, signal);
              if (active()) await store.block(job, error, remote, active);
            } else if (error.kind === 'rejected') await store.block(job, error, null, active);
            else throw error;
          }
        }
        state = await store.read();
        let from = state.cursor, until;
        for (let count = 0; count < 1000 && active(); count++) {
          const page = await api.changes(from, until, signal);
          if (!active()) return;
          if (!await store.applyChanges(page, from, active)) break;
          from = page.cursor; until = page.until;
          if (!page.hasMore) break;
        }
        if (!active()) return;
        failures = 0;
        state = await store.read();
        const conflicts = Object.keys(state.blocked).length;
        publish(conflicts ? 'conflict' : Object.keys(state.dirty).length ? 'pending' : 'ready', conflicts ? '有待核对的修改，其他记录继续同步。' : Object.keys(state.dirty).length ? '修改已保存，正在等待下一轮补传。' : '已同步', { lastSuccess: now() });
      } catch (error) {
        if (!active()) return;
        failures++;
        publish(['login', 'permission'].includes(error.kind) ? error.kind : 'failed', ['login', 'permission'].includes(error.kind) ? error.message : '暂时无法同步，本机内容保留，将自动重试。');
      }
    })();
    running = operation;
    try { await operation; }
    finally {
      if (running === operation) running = undefined;
      if (!stopped) timer = schedule(() => { void run(); }, failures ? Math.min(120000, 5000 * 2 ** Math.min(failures - 1, 5)) : 30000);
    }
  }
  return {
    run,
    wake() { if (stopped) return; cancel(timer); timer = schedule(() => { void run(); }, 250); },
    interrupt() { generation++; request?.abort(); },
    stop() { stopped = true; generation++; cancel(timer); request?.abort(); },
  };
}
