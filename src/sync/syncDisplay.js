// 显示状态不改变同步开关、队列和请求；回退期间仍允许后台补传。
export function syncDisplayMode(snapshot, status, auth, localFallback = false) {
  if (!snapshot?.enabled) return 'local';
  if (localFallback) return 'fallback';
  if (status.phase === 'offline') return 'offline';
  if (Object.keys(snapshot.blocked ?? {}).length) return 'conflict';
  if (['failed', 'login', 'permission'].includes(status.phase)) return 'failed';
  if (status.phase === 'syncing') return 'syncing';
  if (Object.keys(snapshot.dirty ?? {}).length || status.phase !== 'ready' || !auth?.canWrite || !status.lastSuccess) return 'pending';
  return 'ready';
}
