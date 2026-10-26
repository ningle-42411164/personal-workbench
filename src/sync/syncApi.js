import { CLOUD_CONFIG, CloudError } from '../cloud/cloudConfig.js';
import { validateWorkbenchData } from '../data/workbenchData.js';
import { normalizeUserTags } from '../data/userTags.js';
import { equal, syncSupported } from './syncStore.js';

const fail = (kind, message, code = '') => Object.assign(new CloudError(kind, message), { code });
function record(value, id) {
  if (!Number.isSafeInteger(value?.version) || value.version < 1 || (value.deleted ? value.id : value.item?.id) !== id) throw fail('network', '未能核对服务端回执，将保留原请求重试。');
  // 仅校验当前同步范围；升级范围会重置一次游标，避免漏掉旧客户端跳过的记录。
  if (!value.deleted && syncSupported(value.item)) validateWorkbenchData({ schemaVersion: 2, items: [value.item] });
  return value;
}

export function createSyncApi({ auth, fetcher = globalThis.fetch, issuer = CLOUD_CONFIG.issuer } = {}) {
  async function request(path, method, body, signal) {
    let token = await auth.getAccessToken();
    if (!token) throw fail('login', '本机已保存，登录云端后自动继续同步。');
    if (method !== 'GET' && !auth.getStatus().canWrite) throw fail('permission', '本机已保存；首次增加写权限后才能自动同步。');
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetcher(new URL(path, issuer), { method, credentials: 'omit', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
      if (response.status === 401 && attempt === 0) { token = await auth.getAccessToken(true); if (!token) throw fail('login', '连接已失效，本机修改保留；重新登录后继续。'); continue; }
      if (!response.ok) {
        let code = ''; try { code = (await response.json()).code; } catch { /* 不输出原始响应或凭据。 */ }
        if (response.status === 401) throw fail('login', '连接已失效，本机修改保留。', code);
        if (response.status === 403) throw fail('permission', '连接没有所需权限，本机修改保留。', code);
        if (['VERSION_CONFLICT', 'ITEM_ID_EXISTS', 'ITEM_DELETED'].includes(code)) throw fail('conflict', '云端版本与本机不同，双方内容保留，等待核对。', code);
        if (response.status >= 500 || [408, 429].includes(response.status)) throw fail('network', '连接暂不可用，本机已保存，将自动重试。', code);
        throw fail('rejected', '此项同步被拒绝，原内容已保留，请查看连接区。', code);
      }
      return response.json();
    }
  }
  return {
    async send(job, signal) {
      const { requestId, expectedVersion, item, id } = job;
      const result = await request(item ? `/api/sync/items/${encodeURIComponent(id)}` : `/api/items/${encodeURIComponent(id)}`,
        item ? 'PUT' : 'DELETE', { requestId, expectedVersion, ...(item ? { item } : {}) }, signal);
      record(result, id);
      const validVersion = expectedVersion === 0 ? result.version === 1 : result.version === expectedVersion + 1 || item && result.version === expectedVersion;
      if (!validVersion || Boolean(result.deleted) !== !item || item && !equal(result.item, { ...item, tags: normalizeUserTags(item.tags) })) throw fail('network', '回执与原请求不一致，本机内容保留，将使用原请求重新核对。');
      return result;
    },
    async get(id, signal) { return record(await request(`/api/sync/items/${encodeURIComponent(id)}`, 'GET', null, signal), id); },
    async changes(since, until, signal) {
      const query = new URLSearchParams({ since, limit: '100', ...(until ? { until } : {}) });
      const page = await request(`/api/changes?${query}`, 'GET', null, signal);
      if (!Array.isArray(page?.changes) || typeof page.hasMore !== 'boolean' || !/^\d+$/.test(page.cursor) || !/^\d+$/.test(page.until)
        || !Number.isSafeInteger(Number(page.cursor)) || !Number.isSafeInteger(Number(page.until)) || until && page.until !== until
        || Number(page.cursor) < Number(since) || Number(page.cursor) > Number(page.until) || !page.hasMore && page.cursor !== page.until
        || page.hasMore && Number(page.cursor) <= Number(since)) throw fail('network', '同步分页无效，保留此前内容。');
      let sequence = Number(since);
      for (const change of page.changes) {
        if (!Number.isSafeInteger(Number(change.seq)) || Number(change.seq) <= sequence || Number(change.seq) > Number(page.cursor) || typeof change.deleted !== 'boolean') throw fail('network', '同步顺序无效，保留此前内容。');
        sequence = Number(change.seq);
        record(change.deleted ? change : change.record, change.id);
        if (!change.deleted && change.record.version !== change.version) throw fail('network', '同步版本不一致。');
      }
      return page;
    },
  };
}
