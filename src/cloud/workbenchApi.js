import { CLOUD_CONFIG, CloudError } from './cloudConfig.js';
import { validateWorkbenchData } from '../data/workbenchData.js';

export class SaveError extends CloudError {
  constructor(kind, message, { unknown = false, code = '' } = {}) {
    super(kind, message); this.unknown = unknown; this.code = code;
  }
}

function validateRecord(record, type) {
  if (!record?.item?.id || !Number.isInteger(record.version) || record.version < 1 || (type && record.item.type !== type)) throw new CloudError('response', '云端返回格式不正确，保留草稿并重新读取。');
  validateWorkbenchData({ schemaVersion: 2, items: [record.item] });
  return record;
}

// 只实现服务端已有的 todo 创建和项目更新；绝不调用本机 saveTasks。
export function createWorkbenchApi({ config = CLOUD_CONFIG, auth, fetcher = globalThis.fetch } = {}) {
  async function request(path, { signal, method = 'GET', body, type } = {}) {
    const writing = method !== 'GET';
    let token = await auth.getAccessToken();
    if (!token) throw new SaveError('login', '请先登录云端连接；输入保留。');
    if (writing && !auth.getStatus().canWrite) throw new SaveError('permission', '请先明确授权云端测试写入；输入保留。');
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;
      try {
        response = await fetcher(new URL(path, config.issuer), { method, credentials: 'omit', cache: 'no-store',
          headers: { Authorization: `Bearer ${token}`, ...(writing ? { 'Content-Type': 'application/json' } : {}) },
          ...(writing ? { body: JSON.stringify(body) } : {}),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      } catch (error) {
        if (!writing) throw error;
        throw new SaveError('unknown', '保存结果不明。输入已保留；请使用原请求重试，避免重复创建。', { unknown: true });
      }
      if (response.status === 401 && attempt === 0) {
        token = await auth.getAccessToken(true);
        if (!token) throw new SaveError('login', '连接已失效，请重新登录；输入保留。');
        continue;
      }
      if (!response.ok) {
        let code = '';
        try { code = (await response.json()).code; } catch { /* 不向界面暴露原始服务响应。 */ }
        if (writing) {
          if (code === 'VERSION_CONFLICT') throw new SaveError('conflict', '版本冲突：云端已有较新修改。草稿保留，请读取最新项目并人工核对。', { code });
          if (code === 'REQUEST_ID_REUSED') throw new SaveError('request', '请求标识已被不同内容使用。已停止保存，请保留草稿并联系排查。', { code });
          const unknown = response.status >= 500 || response.status === 408;
          throw new SaveError(unknown ? 'unknown' : 'rejected', unknown ? '保存结果不明；请使用原请求重试。' : '保存被拒绝，请检查授权及输入；草稿保留。', { unknown, code });
        }
        throw new CloudError('network', '无法读取项目，请检查连接；草稿保留。');
      }
      try { return validateRecord(await response.json(), type); }
      catch {
        if (writing) throw new SaveError('unknown', '未能核对保存响应；请使用原请求重试。', { unknown: true });
        throw new CloudError('response', '项目返回格式不正确，草稿保留。');
      }
    }
    throw new SaveError('login', '云端会话已失效，请重新登录；输入保留。');
  }
  return {
    getProject(id, signal) { return request(`/api/projects/${encodeURIComponent(id)}`, { signal, type: 'project' }); },
    createTodo(body, signal) { return request('/api/items', { method: 'POST', body, signal, type: 'todo' }); },
    updateProject({ id, ...body }, signal) { return request(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body, signal, type: 'project' }); },
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
