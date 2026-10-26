import { CLOUD_CONFIG, CloudError } from './cloudConfig.js';
import { validateWorkbenchData } from '../data/workbenchData.js';

// 1A 只有 GET：不导出创建、更新、删除方法，云端结果不进入 saveTasks。
export function createWorkbenchApi({ config = CLOUD_CONFIG, auth, fetcher = globalThis.fetch } = {}) {
  return {
    async listItems(signal) {
      let token = await auth.getAccessToken();
      if (!token) throw new CloudError('login', '请先登录云端连接；本机数据不受影响。');
      const records = [];
      const ids = new Set();
      let offset = 0;
      let retried = false;
      for (let page = 0; page < 1000; page++) {
        if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
        const url = new URL('/api/items', config.issuer);
        url.search = new URLSearchParams({ includeCompleted: 'true', limit: '100', offset: String(offset) }).toString();
        const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
        if (response.status === 401 && !retried) {
          retried = true; token = await auth.getAccessToken(true);
          if (!token) throw new CloudError('login', '云端会话已失效，请重新登录。');
          page--; continue;
        }
        if (!response.ok) throw new CloudError(response.status === 401 ? 'login' : 'network', response.status === 401 ? '云端会话已失效，请重新登录。' : '云端读取失败；已有内容可能已过期。');
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new CloudError('response', '云端返回格式不正确，保留此前读取的内容。');
        for (const record of data.items) {
          if (!record?.item?.id || !Number.isInteger(record.version) || record.version < 1 || ids.has(record.item.id)) throw new CloudError('response', '云端分页内容发生变化，请重新读取；此前内容保留。');
          ids.add(record.item.id); records.push(record);
        }
        if (data.nextOffset === null) {
          validateWorkbenchData({ schemaVersion: 2, items: records.map(record => record.item) });
          return records;
        }
        if (!Number.isInteger(data.nextOffset) || data.nextOffset <= offset) throw new CloudError('response', '云端分页位置不正确，请重新读取。');
        offset = data.nextOffset;
      }
      throw new CloudError('response', '云端数据超过本批读取范围，请联系维护者。');
    },
  };
}
