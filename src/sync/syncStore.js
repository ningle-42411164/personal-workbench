import { STORAGE_KEY, emptyWorkbenchData, validateWorkbenchData, removeItem } from '../data/workbenchData.js';
import { isKnownTestRecord } from './knownTestRecords.js';
import { PHONE_ENROLLMENT_VERSION } from './ownerPhone.js';

import { SYNC_SCOPE_VERSION, syncSupported } from './syncPolicy.js';
export { syncSupported } from './syncPolicy.js';
export const copy = value => JSON.parse(JSON.stringify(value));
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export const equal = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
const currentItem = (state, id) => state.data.items.find(item => item.id === id) ?? null;
function putItem(state, item, id) {
  state.data.items = item ? [...state.data.items.filter(value => value.id !== id), item]
    : state.data.items.some(value => value.id === id) ? removeItem(state.data.items, id) : state.data.items;
}
function dirty(state, id) {
  if (isKnownTestRecord(id) || !state.bindings[id]) return;
  if (state.outbox[id] || !equal(currentItem(state, id), state.bindings[id].base)) state.dirty[id] = true;
  else delete state.dirty[id];
}

function isolateKnownTests(state) {
  state.testRecords ??= {};
  for (const id of new Set([...state.data.items.map(item => item.id), ...Object.keys(state.bindings), ...Object.keys(state.outbox), ...Object.keys(state.blocked), ...Object.keys(state.dirty)])) {
    if (!isKnownTestRecord(id)) continue;
    // 不移除 v2 原文，避免破坏本机随笔等分类的转换关联；正式视图和同步分别按 ID 排除。
    if (state.bindings[id] || state.outbox[id] || state.blocked[id] || state.dirty[id]) {
      state.testRecords[id] = { binding: state.bindings[id] ?? null, outbox: state.outbox[id] ?? null,
        blocked: state.blocked[id] ?? null, dirty: Boolean(state.dirty[id]) };
    }
    delete state.bindings[id]; delete state.outbox[id]; delete state.blocked[id]; delete state.dirty[id];
  }
}

// 事项、版本、待发送请求和拉取游标在同一个 IndexedDB 事务中提交。
// 旧 LocalStorage v2 原文只保留为迁移前备份；导出仍使用原 v2 格式。
export function createSyncStore({ indexedDB, storage, name = 'personal-workbench.local-sync.v1', uuid = () => crypto.randomUUID(), ownerPhone = false, now = () => new Date().toISOString() } = {}) {
  let opening;
  const listeners = new Set();
  const legacy = () => (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
  async function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = (indexedDB ?? globalThis.indexedDB).open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(new Error('无法打开本机保存空间，原数据保持不变。'));
      request.onblocked = () => reject(new Error('旧窗口占用保存空间，请关闭旧窗口后重试。'));
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  }
  async function transact(change) {
    const db = await open();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      let next, result, failure, changed;
      store.get('workbench').onsuccess = event => {
        try {
          next = event.target.result;
          const before = JSON.stringify(next);
          if (!next) {
            const raw = legacy();
            next = { format: 1, data: raw === null ? emptyWorkbenchData() : validateWorkbenchData(JSON.parse(raw)), revision: 0,
              enabled: false, bindings: {}, dirty: {}, outbox: {}, blocked: {}, archive: [], cursor: '0', legacyRaw: raw };
          }
          if (legacy() !== next.legacyRaw) throw new Error('检测到旧版窗口另存了本机数据。已暂停写入；请导出两边备份后核对，避免覆盖。');
          isolateKnownTests(next);
          if ((next.syncScopeVersion ?? 1) < SYNC_SCOPE_VERSION) {
            next.cursor = '0'; next.syncScopeVersion = SYNC_SCOPE_VERSION;
          }
          const previous = copy(next.data);
          // 回调必须同步；网络和授权刷新不得放进这个事务。
          result = change(next);
          if (result?.then) throw new Error('本机事务不能等待网络。');
          validateWorkbenchData(next.data);
          if (!equal(previous, next.data)) next.revision++;
          changed = before !== JSON.stringify(next);
          store.put(next, 'workbench');
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve({ state: next, result, changed });
      tx.onerror = tx.onabort = () => reject(failure ?? new Error('本机保存未完成，输入已保留。'));
    });
    if (result.changed) listeners.forEach(listener => listener(copy(result.state)));
    return result;
  }
  const read = async () => (await transact(() => {})).state;
  function expected(state, revision) {
    if (state.revision !== revision) throw new Error('另一个窗口或云端已更新内容，输入保留。请核对最新记录后再保存。');
  }
  return {
    read,
    ownerPhone,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async save(data, revision, { importing = false } = {}) {
      validateWorkbenchData(data);
      return (await transact(state => {
        expected(state, revision);
        if (importing && Object.keys(state.bindings).length) throw new Error('已有同步记录，不能用整份备份覆盖。请保留备份，先完成首次纳入/冲突核对。');
        const oldIds = new Set(state.data.items.map(item => item.id));
        const previous = state.data;
        state.data = copy(data);
        if (ownerPhone && state.enabled && !importing) for (const item of data.items) {
          if (!oldIds.has(item.id) && syncSupported(item) && !isKnownTestRecord(item.id) && !state.heldLocal?.[item.id] && !state.bindings[item.id]) state.bindings[item.id] = { version: 0, base: null };
        }
        for (const id of Object.keys(state.bindings)) {
          if (state.blocked[id]?.kind === 'rejected' && state.blocked[id].code !== 'REQUEST_ID_REUSED'
            && !equal(previous.items.find(item => item.id === id) ?? null, currentItem(state, id))) {
            delete state.blocked[id]; delete state.outbox[id];
          }
          dirty(state, id);
        }
      })).state;
    },
    async activateOwnerPhone(canWrite) {
      return (await transact(state => {
        if (!ownerPhone || !canWrite) return;
        if (!state.nodeOne) {
          // 所有者已授权手机更新后自动纳入；首次标记与绑定在同一事务中写入。
          // 电脑和隔离页面不会进入此分支；已有绑定、请求与版本原样复用。
          state.nodeOne = { version: PHONE_ENROLLMENT_VERSION, deviceId: uuid(), source: 'owner-phone', startedAt: now(), enrolledIds: [] };
          state.enabled = true;
        }
        if (!state.enabled) return; // 首次完成后用户明确暂停，不因刷新/续期再次开启。
        for (const item of state.data.items) {
          if (!syncSupported(item) || isKnownTestRecord(item.id) || state.heldLocal?.[item.id] || state.bindings[item.id]) continue;
          state.bindings[item.id] = { version: 0, base: null };
          state.nodeOne.enrolledIds.push(item.id);
          dirty(state, item.id);
        }
      })).state;
    },
    async setEnabled(enabled) { return (await transact(state => { state.enabled = Boolean(enabled); })).state; },
    async enroll(ids, revision) {
      return (await transact(state => {
        expected(state, revision);
        for (const id of ids) {
          const item = currentItem(state, id);
          if (!item || !syncSupported(item) || isKnownTestRecord(id) || state.bindings[id]) throw new Error('纳入预览已变化，请重新核对。');
          state.bindings[id] = { version: 0, base: null }; dirty(state, id);
        }
      })).state;
    },
    async prepare() {
      return (await transact(state => {
        if (!state.enabled) return null;
        for (const id of Object.keys(state.dirty)) {
          if (isKnownTestRecord(id)) continue;
          // 转换关联在下一批原子同步前暂缓，原随笔和目标均留在本机，不能只发送一半。
          if (state.data.items.some(item => item.convertedToId && (item.id === id || item.convertedToId === id))) continue;
          if (state.blocked[id]) continue;
          if (state.outbox[id]) return state.outbox[id];
          const item = currentItem(state, id), binding = state.bindings[id];
          if (binding.version === 0 && !item) { delete state.dirty[id]; delete state.bindings[id]; continue; }
          const job = { id, requestId: uuid(), expectedVersion: binding.version, item: item ? copy(item) : null };
          state.outbox[id] = job; return job;
        }
        return null;
      })).result;
    },
    async acknowledge(job, response, allowed = () => true) {
      return (await transact(state => {
        if (!allowed()) return;
        if (state.outbox[job.id]?.requestId !== job.requestId) return;
        const desired = currentItem(state, job.id);
        state.bindings[job.id] = { version: response.version, base: response.deleted ? null : response.item, deleted: Boolean(response.deleted) };
        if (equal(desired, job.item)) putItem(state, response.deleted ? null : response.item, job.id);
        delete state.outbox[job.id]; delete state.blocked[job.id];
        if (response.deleted && desired) state.blocked[job.id] = { kind: 'conflict', message: '该 ID 已删除；本机后来修改已保留，请保留副本后处理。', remote: response, base: job.item };
        dirty(state, job.id);
      })).state;
    },
    async block(job, error, remote = null, allowed = () => true) {
      return (await transact(state => {
        if (!allowed()) return;
        if (state.outbox[job.id]?.requestId !== job.requestId) return;
        state.blocked[job.id] = { kind: error.kind ?? 'rejected', code: error.code ?? '', message: error.message, remote, base: state.bindings[job.id].base };
      })).state;
    },
    async applyChanges(page, from, allowed = () => true) {
      return (await transact(state => {
        if (!allowed() || !state.enabled || state.cursor !== from) return false;
        for (const change of page.changes) {
          const id = change.id, binding = state.bindings[id];
          if (isKnownTestRecord(id)) continue;
          if (!binding && (!change.record || !syncSupported(change.record.item))) continue;
          if (binding && change.version <= binding.version) continue;
          if (state.dirty[id] || state.outbox[id]) continue; // 本机未确认的修改不能被拉取覆盖；重放后再决定冲突。
          if (!binding && currentItem(state, id)) {
            state.blocked[id] = { kind: 'collision', message: '本机与云端存在相同 ID，保留双方，未自动纳入。', remote: change.deleted ? change : change.record, base: null };
            continue;
          }
          state.bindings[id] = { version: change.version, base: change.deleted ? null : change.record.item, deleted: change.deleted };
          putItem(state, change.deleted ? null : change.record.item, id);
        }
        state.cursor = page.cursor;
        return true;
      })).result;
    },
    async resolveWithCopy(id, revision) {
      return (await transact(state => {
        expected(state, revision);
        const conflict = state.blocked[id];
        if (!conflict?.remote) throw new Error('尚未取得云端版本，请恢复连接后重新核对。');
        const local = currentItem(state, id);
        state.archive.push({ id, local, ...conflict });
        // 冲突副本保留在本机，不参加首次/重复自动纳入；不会用旧版本自动覆盖云端。
        if (local) {
          const copyId = uuid();
          state.data.items.push({ ...copy(local), id: copyId, title: `${local.title.slice(0, 140)}（冲突副本）` });
          state.heldLocal ??= {}; state.heldLocal[copyId] = { reason: 'conflict-copy', originalId: id };
        }
        const remote = conflict.remote;
        putItem(state, remote.deleted ? null : remote.item, id);
        state.bindings[id] = { version: remote.version, base: remote.deleted ? null : remote.item, deleted: Boolean(remote.deleted) };
        delete state.blocked[id]; delete state.outbox[id]; delete state.dirty[id];
      })).state;
    },
    async close() { (await opening)?.close(); opening = undefined; listeners.clear(); },
  };
}
