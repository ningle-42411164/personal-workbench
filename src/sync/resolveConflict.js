import { linkedIds } from './syncPolicy.js';
import { equal } from './syncStore.js';

// 网络读在事务外，选择提交在事务内；界面看到的云端版本变化时只更新对照，不代选。
export async function resolveConflict({ store, api, id, choice, revision, displayed, signal }) {
  if (!['local', 'remote'].includes(choice)) throw new Error('请选择本机或云端版本。');
  const state = await store.read(), original = state.blocked[id];
  if (state.revision !== revision || !original?.remote) throw new Error('内容已变化或未取得云端版本，请重新核对。');
  if (displayed && !equal(displayed, original)) throw new Error('冲突对照已变化，请核对最新双方内容后再选择。');
  if (original.resolving) throw new Error('原选择仍待确认，请等待原请求重试。');
  const graph = [...state.data.items, ...Object.values(state.bindings).map(value => value.base), ...(original.group ?? [original.remote]).map(value => value.item)];
  const ids = new Set([...(original.group ?? [original.remote]).map(value => value.item?.id ?? value.id), ...linkedIds(id, graph)]);
  const records = [];
  for (const key of ids) {
    if (ids.size > 32) throw new Error('关联组超过上限，双方内容保留。');
    const remote = await api.get(key, signal, true);
    records.push(remote); graph.push(remote.item);
    for (const linked of linkedIds(key, graph)) ids.add(linked);
  }
  if (!await store.reviewConflict(id, revision, original, records)) throw new Error('云端再次变化，已更新对照；请核对后重新选择。');
  return choice === 'local' ? store.resolveWithLocal(id, revision, original) : store.resolveWithCopy(id, revision, original);
}
