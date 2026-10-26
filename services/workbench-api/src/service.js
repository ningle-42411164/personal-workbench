import { createSchema, updateSchema, listSchema, getProjectSchema, makeItem, patchProject, fingerprint } from './domain.js';
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
