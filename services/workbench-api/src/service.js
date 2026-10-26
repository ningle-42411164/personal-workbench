import { createSchema, updateSchema, listSchema, getProjectSchema, makeItem, patchProject, fingerprint, itemPatchSchema, completionSchema, deleteSchema, changesSchema, patchItem, setCompletion, syncSchema, syncItem } from './domain.js';
import { ApiError } from './errors.js';

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
    const hash = await fingerprint('sync_item', parsed);
    const replay = await this.store.receipt(parsed.requestId, hash);
    if (replay) return replay;
    if (parsed.expectedVersion === 0) return this.store.create(parsed.requestId, hash, syncItem(parsed));
    const current = await this.getItem({ id: parsed.id });
    if (current.version !== parsed.expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', '记录已变化，本机修改保留待比较。');
    return this.store.update(parsed.requestId, hash, current, syncItem(parsed, current.item));
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
