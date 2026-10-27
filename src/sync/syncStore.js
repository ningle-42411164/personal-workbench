import { STORAGE_KEY, emptyWorkbenchData, validateWorkbenchData, removeItem } from '../data/workbenchData.js';
import { isKnownTestRecord } from './knownTestRecords.js';
import { PHONE_ENROLLMENT_VERSION } from './ownerPhone.js';

import { SYNC_SCOPE_VERSION, syncSupported, linkedIds } from './syncPolicy.js';
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
            next.cursor = '0'; delete next.pull; next.syncScopeVersion = SYNC_SCOPE_VERSION;
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
            const rejected = state.outbox[id];
            for (const entry of rejected?.entries ?? [{ id }]) { delete state.blocked[entry.id]; delete state.outbox[entry.id]; }
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
          // 用户选择本机后的请求仍保留冲突对照，直到服务端确认；失败重试同一请求。
          if (state.blocked[id]?.resolving && state.outbox[id]) return state.outbox[id];
          if (state.blocked[id]) continue;
          if (state.outbox[id]) return state.outbox[id];
          const item = currentItem(state, id), binding = state.bindings[id];
          if (binding.version === 0 && !item) { delete state.dirty[id]; delete state.bindings[id]; continue; }
          const ids = linkedIds(id, [...state.data.items, ...Object.values(state.bindings).map(value => value.base)]);
          if (ids.length > 1) {
            // 已发出的旧请求先按原内容确认；不能用一次转换替换结果不明的请求。
            const previousJob = ids.map(key => state.outbox[key]).find(Boolean);
            if (previousJob && !ids.some(key => state.blocked[key])) return previousJob;
            if (ids.some(key => isKnownTestRecord(key) || !state.bindings[key] || state.heldLocal?.[key])) {
              state.blocked[id] = { kind: 'rejected', code: 'LOCAL_REFERENCE', message: '关联目标属于隔离记录或本机保留副本，关联双方保留，暂不上传。' }; continue;
            }
            if (ids.some(key => state.blocked[key])) continue;
            const entries = ids.filter(key => state.bindings[key].version > 0 || currentItem(state, key)).map(key => ({ id: key, expectedVersion: state.bindings[key].version, item: copy(currentItem(state, key)) }));
            if (entries.length > 32) { state.blocked[id] = { kind: 'rejected', code: 'GROUP_TOO_LARGE', message: '关联组超过一次提交上限，原内容保留。' }; continue; }
            if (entries.length > 1) {
              const job = { id, requestId: uuid(), entries };
              for (const entry of entries) { state.outbox[entry.id] = job; state.dirty[entry.id] = true; }
              return job;
            }
          }
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
        const resolving = state.blocked[job.id];
        if (resolving?.resolving) {
          const sent = new Set((job.entries ?? [job]).map(entry => entry.id));
          for (const remote of resolving.group ?? [resolving.remote]) {
            const key = remote.item?.id ?? remote.id;
            state.archive.push({ id: key, local: copy(currentItem(state, key)), ...resolving, choice: 'local' });
            if (!sent.has(key)) {
              if (remote.missing) delete state.bindings[key];
              else state.bindings[key] = { version: remote.version, base: remote.deleted ? null : remote.item, deleted: Boolean(remote.deleted) };
              delete state.blocked[key]; delete state.outbox[key]; delete state.dirty[key];
            }
          }
        }
        if (job.entries) {
          const unchanged = job.entries.every(entry => equal(currentItem(state, entry.id), entry.item));
          for (const entry of job.entries) {
            const result = response.records.find(value => (value.item?.id ?? value.id) === entry.id);
            const desired = currentItem(state, entry.id);
            state.bindings[entry.id] = { version: result.version, base: result.deleted ? null : result.item, deleted: Boolean(result.deleted) };
            if (unchanged) putItem(state, result.deleted ? null : result.item, entry.id);
            delete state.outbox[entry.id]; delete state.blocked[entry.id];
            if (result.deleted && desired) state.blocked[entry.id] = { kind: 'conflict', message: '关联记录已删除，后续本机修改保留。', remote: result, base: entry.item, group: response.records };
            dirty(state, entry.id);
          }
          return;
        }
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
        const entries = remote?.records ? remote.records.map(value => ({ id: value.item?.id ?? value.id })) : job.entries ?? [job];
        for (const entry of entries) {
          const previous = state.blocked[entry.id];
          // 明确拒绝也不能丢掉已展示的云端对照；未知网络失败则不进入这里，保留 resolving 原请求。
          state.blocked[entry.id] = { kind: error.kind ?? 'rejected', code: error.code ?? '', message: error.message,
            remote: remote?.records ? remote.records.find(value => (value.item?.id ?? value.id) === entry.id) : remote ?? previous?.remote ?? null,
            ...(remote?.records ? { group: remote.records } : previous?.group ? { group: previous.group } : {}), base: state.bindings[entry.id]?.base ?? null };
        }
      })).state;
    },
    async applyChanges(page, from, allowed = () => true) {
      return (await transact(state => {
        if (!allowed() || !state.enabled || state.cursor !== from) return false;
        // 分页仅暂存；收齐同一高水位后一起应用，跨页转换不会产生短暂断链。
        if (state.pull && state.pull.until !== page.until) return false;
        const staged = state.pull ?? { until: page.until, changes: {} };
        for (const change of page.changes) staged.changes[change.id] = change;
        state.cursor = page.cursor;
        if (page.hasMore) { state.pull = staged; return true; }
        const changes = Object.values(staged.changes);
        const graph = [...state.data.items, ...Object.values(state.bindings).map(value => value.base), ...changes.map(value => value.record?.item)];
        const skipped = new Set();
        for (const change of changes) {
          const ids = linkedIds(change.id, graph);
          if (ids.some(id => state.dirty[id] || state.outbox[id] || state.blocked[id])) ids.forEach(id => skipped.add(id));
          if (ids.some(id => !state.bindings[id] && currentItem(state, id))) {
            ids.forEach(id => skipped.add(id));
            const group = ids.map(id => { const remote = staged.changes[id]; return remote ? remote.deleted ? remote : remote.record : state.bindings[id]?.base ? { item: state.bindings[id].base, version: state.bindings[id].version } : { id, deleted: true, missing: true, version: 0 }; });
            for (const remote of group) {
              const id = remote.item?.id ?? remote.id;
              if (currentItem(state, id) && !state.bindings[id]) state.blocked[id] = { kind: 'collision', message: '本机与云端存在相同 ID，关联双方保留。', remote, group, base: null };
            }
          }
        }
        for (const change of changes) {
          const id = change.id, binding = state.bindings[id];
          if (isKnownTestRecord(id) || skipped.has(id)) continue;
          if (!change.deleted && !syncSupported(change.record.item)) continue;
          if (binding && change.version <= binding.version) continue;
          state.bindings[id] = { version: change.version, base: change.deleted ? null : change.record.item, deleted: change.deleted };
          putItem(state, change.deleted ? null : change.record.item, id);
        }
        delete state.pull;
        return true;
      })).result;
    },
    async reviewConflict(id, revision, original, records) {
      return (await transact(state => {
        expected(state, revision);
        if (!equal(state.blocked[id], original)) throw new Error('冲突状态已变化，请核对后再选择。');
        if (original.resolving) throw new Error('上次选择尚待服务端确认，将复用原请求重试，暂不能改选。');
        const previous = original.group ?? [original.remote];
        if (equal([...previous].sort((a, b) => (a.item?.id ?? a.id).localeCompare(b.item?.id ?? b.id)), [...records].sort((a, b) => (a.item?.id ?? a.id).localeCompare(b.item?.id ?? b.id)))) return true;
        for (const remote of records) {
          const key = remote.item?.id ?? remote.id;
          state.blocked[key] = { kind: 'conflict', message: '云端再次变化，已更新双方对照，请重新选择。', remote,
            group: records, base: state.bindings[key]?.base ?? null };
        }
        return false;
      })).result;
    },
    async resolveWithLocal(id, revision, original) {
      return (await transact(state => {
        expected(state, revision);
        const conflict = state.blocked[id];
        if (!conflict?.remote || !equal(conflict, original)) throw new Error('冲突状态已变化，请重新核对。');
        if (conflict.resolving) return;
        const records = conflict.group ?? [conflict.remote];
        // 已删除 ID 不允许复活；保留双方，不能偷偷退化成采用云端。
        if (records.some(remote => remote.deleted && !remote.missing && currentItem(state, remote.id))) throw new Error('云端已删除此 ID，不能直接覆盖删除标记。双方内容仍保留，尚未解决。');
        const entries = records.flatMap(remote => {
          const key = remote.item?.id ?? remote.id, item = currentItem(state, key);
          return !item && remote.deleted ? [] : [{ id: key, expectedVersion: remote.version, item: copy(item) }];
        });
        if (!entries.length) throw new Error('双方均已删除，请采用云端确认删除结果。');
        const job = entries.length > 1 ? { id: entries[0].id, requestId: uuid(), entries } : { ...entries[0], requestId: uuid() };
        // 用户选择与不可变内容在一个本机事务中落盘；不修改基准，也不清除冲突。
        for (const entry of entries) {
          state.outbox[entry.id] = job; state.dirty[entry.id] = true;
          state.blocked[entry.id] = { ...(state.blocked[entry.id] ?? conflict), resolving: true, message: '已选择本机，等待服务端确认；失败保留双方并按原请求重试。' };
        }
      })).state;
    },
    async resolveWithCopy(id, revision, original) {
      return (await transact(state => {
        expected(state, revision);
        const conflict = state.blocked[id];
        if (!conflict?.remote) throw new Error('尚未取得云端版本，请恢复连接后重新核对。');
        if (original && !equal(original, conflict)) throw new Error('冲突状态已变化，请重新核对。');
        if (conflict.resolving) throw new Error('上次选择尚待确认，不能丢弃结果不明的请求。');
        if (conflict.group) {
          const ids = conflict.group.map(value => value.item?.id ?? value.id), copies = new Map();
          for (const key of ids) if (currentItem(state, key)) copies.set(key, uuid());
          for (const [key, copyId] of copies) {
            const local = copy(currentItem(state, key));
            state.archive.push({ id: key, local, ...(state.blocked[key] ?? conflict) });
            if (copies.has(local.convertedToId)) local.convertedToId = copies.get(local.convertedToId);
            state.data.items.push({ ...local, id: copyId, title: `${local.title.slice(0, 140)}（冲突副本）` });
            state.heldLocal ??= {}; state.heldLocal[copyId] = { reason: 'conflict-copy', originalId: key };
          }
          for (const remote of conflict.group) {
            const key = remote.item?.id ?? remote.id;
            putItem(state, remote.deleted ? null : remote.item, key);
            if (remote.missing) delete state.bindings[key];
            else state.bindings[key] = { version: remote.version, base: remote.deleted ? null : remote.item, deleted: Boolean(remote.deleted) };
            delete state.blocked[key]; delete state.outbox[key]; delete state.dirty[key];
          }
          return;
        }
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
