import { createSchema, updateSchema, listSchema, getProjectSchema, makeItem, patchProject, fingerprint, itemPatchSchema, completionSchema, deleteSchema, changesSchema, patchItem, setCompletion, syncSchema, syncItem } from './domain.js';
import { ApiError } from './errors.js';
import { syncBatchSchema, convertSchema } from './domain.js';
import { convertNote } from '../../../src/data/workbenchData.js';

export const READ_SCOPE = 'workbench:read';
export const WRITE_SCOPE = 'workbench:write';

export class WorkbenchService {
  constructor(store, principal) { this.store = store; this.principal = principal; }
  require(scope) {
    if (!this.principal?.id || !this.principal.scopes.includes(scope)) {
      throw new ApiError(403, 'INSUFFICIENT_SCOPE', '未获得此操作所需的工作台权限。');
    }
  }
  async list(input) {
    this.require(READ_SCOPE);
    return this.store.list(listSchema.parse(input));
  }
  async getProject(input) {
    this.require(READ_SCOPE);
    const { id } = getProjectSchema.parse(input);
    const record = await this.store.get(id);
    if (!record || record.item.type !== 'project') throw new ApiError(404, 'NOT_FOUND', '项目不存在。');
    return record;
  }
  async getItem(input) {
    this.require(READ_SCOPE);
    const { id } = getProjectSchema.parse(input);
    const record = await this.store.get(id);
    if (!record) {
      if (await this.store.deleted(id)) throw new ApiError(410, 'ITEM_DELETED', '该事项已删除，旧设备不得重新创建。');
      throw new ApiError(404, 'NOT_FOUND', '事项不存在。');
    }
    return record;
  }
  async changes(input) { this.require(READ_SCOPE); return this.store.changes(changesSchema.parse(input)); }
  async syncState(input) {
    this.require(READ_SCOPE);
    const { id } = getProjectSchema.parse(input);
    const record = await this.store.get(id);
    if (record) return record;
    const deleted = await this.store.deleted(id);
    if (deleted) return { id, version: deleted.version, deleted: true };
    throw new ApiError(404, 'NOT_FOUND', '事项不存在。');
  }
  async sync(input) {
    this.require(READ_SCOPE); this.require(WRITE_SCOPE);
    const parsed = syncSchema.parse(input);
    if (parsed.item.convertedToId) throw new ApiError(400, 'BATCH_REQUIRED', '转换关联必须一起同步，原内容保留。');
    const hash = await fingerprint('sync_item', parsed);
    const replay = await this.store.receipt(parsed.requestId, hash);
    if (replay) return replay;
    if (parsed.expectedVersion === 0) return this.store.create(parsed.requestId, hash, syncItem(parsed));
    const current = await this.getItem({ id: parsed.id });
    if (current.version !== parsed.expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', '记录已变化，本机修改保留待比较。');
    return this.store.update(parsed.requestId, hash, current, syncItem(parsed, current.item));
  }
  async syncBatch(input) {
    this.require(READ_SCOPE); this.require(WRITE_SCOPE);
    const parsed = syncBatchSchema.parse(input);
    if (new Set(parsed.entries.map(entry => entry.id)).size !== parsed.entries.length) throw new ApiError(400, 'INVALID_INPUT', '批次 ID 重复。');
    const hash = await fingerprint('sync_batch', parsed), replay = await this.store.receipt(parsed.requestId, hash);
    if (replay) return replay;
    const entries = [];
    const references = parsed.entries.flatMap(entry => entry.item ? [entry.item] : []);
    const states = await this.store.batchStates(parsed.entries.map(entry => entry.id));
    for (const entry of parsed.entries) {
      const current = states.current.get(entry.id), deleted = states.deleted.has(entry.id);
      if (deleted || !entry.item && !current) throw new ApiError(409, 'VERSION_CONFLICT', '关联记录已删除或不存在，双方内容保留。');
      const item = entry.item ? syncItem(entry, current?.item, references) : null;
      // 手机首次纳入时允许接续完全相同的既有记录；不同内容仍产生冲突。
      const same = current && item === current.item;
      if (entry.expectedVersion !== (current?.version ?? 0) && !(entry.expectedVersion === 0 && same)) throw new ApiError(409, 'VERSION_CONFLICT', '关联记录版本已变化，整个批次未提交。');
      if (!item) {
        const linked = await this.store.references(entry.id);
        if (linked.some(record => !parsed.entries.some(value => value.id === record.item.id && (!value.item || value.item.convertedToId !== entry.id)))) throw new ApiError(409, 'VERSION_CONFLICT', '仍有关联随笔，请保留修改并重新读取。');
      }
      entries.push({ id: entry.id, current, item });
    }
    return this.store.syncBatch(parsed.requestId, hash, entries);
  }
  async convertNote(input) {
    this.require(READ_SCOPE); this.require(WRITE_SCOPE);
    const parsed = convertSchema.parse(input), hash = await fingerprint('convert_note', parsed);
    const replay = await this.store.receipt(parsed.requestId, hash);
    if (replay) return replay;
    const current = await this.getItem({ id: parsed.id });
    if (current.version !== parsed.expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', '随笔已变化，转换未执行。');
    if (current.item.type !== 'note' || current.item.convertedToId) throw new ApiError(400, 'INVALID_INPUT', '只有尚未转换的随笔可以转换。');
    if (parsed.targetDate && parsed.targetType !== 'importantDate') throw new ApiError(400, 'INVALID_INPUT', '只有重要日需要目标日期。');
    if (parsed.targetType === 'importantDate' && !parsed.targetDate) throw new ApiError(400, 'INVALID_INPUT', '重要日需要目标日期。');
    const items = convertNote([current.item], parsed.id, parsed.targetType, parsed.targetDate);
    return this.store.syncBatch(parsed.requestId, hash, items.map(item => ({ id: item.id, current: item.id === parsed.id ? current : null, item })));
  }
  async mutate(operation, parsed, change) {
    this.require(READ_SCOPE); this.require(WRITE_SCOPE);
    const hash = await fingerprint(operation, parsed);
    const replay = await this.store.receipt(parsed.requestId, hash);
    if (replay) return replay;
    const current = await this.getItem({ id: parsed.id });
    if (current.version !== parsed.expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', '记录已变化，请保留修改并重新读取比较。');
    return change(current, hash);
  }
  async patchItem(input) {
    const parsed = itemPatchSchema.parse(input);
    return this.mutate('patch_item', parsed, async (current, hash) => {
      // 校验转换随笔时取同一所有者的真实目标，不删关联字段来绕过 v2 规则。
      const target = current.item.convertedToId ? await this.store.get(current.item.convertedToId) : null;
      if (current.item.convertedToId && !target) throw new ApiError(409, 'VERSION_CONFLICT', '转换目标已变化，请保留修改并重新读取。');
      return this.store.update(parsed.requestId, hash, current, patchItem(current.item, parsed.fields, target ? [target.item] : []));
    });
  }
  async completeItem(input) {
    const parsed = completionSchema.parse(input);
    return this.mutate('set_completion', parsed, (current, hash) => this.store.update(parsed.requestId, hash, current, setCompletion(current.item, parsed.done)));
  }
  async deleteItem(input) {
    const parsed = deleteSchema.parse(input);
    return this.mutate('delete_item', parsed, (current, hash) => this.store.remove(parsed.requestId, hash, current));
  }
  async create(input) {
    this.require(WRITE_SCOPE);
    const parsed = createSchema.parse(input);
    const hash = await fingerprint('create_item', parsed);
    const replay = await this.store.receipt(parsed.requestId, hash);
    return replay ?? this.store.create(parsed.requestId, hash, makeItem(parsed));
  }
  async updateProject(input) {
    this.require(READ_SCOPE);
    this.require(WRITE_SCOPE);
    const parsed = updateSchema.parse(input);
    const hash = await fingerprint('update_project', parsed);
    const replay = await this.store.receipt(parsed.requestId, hash);
    if (replay) return replay;
    const record = await this.getProject({ id: parsed.id });
    if (record.version !== parsed.expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', '记录已变化，请重新读取并与当前修改比较。');
    return this.store.update(parsed.requestId, hash, record, patchProject(record.item, parsed.fields));
  }
}
