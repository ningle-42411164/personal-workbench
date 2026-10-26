import { ApiError } from './errors.js';
import { KNOWN_TEST_IDS } from '../../../src/sync/knownTestRecords.js';

const personalOnly = `item_id NOT IN (${KNOWN_TEST_IDS.map(() => '?').join(', ')})`;

function unpack(row) {
  return row ? { item: JSON.parse(row.item_json), version: row.version } : null;
}

export class D1Store {
  constructor(db, ownerId) {
    this.db = db;
    this.ownerId = ownerId;
  }
  async get(id) {
    return unpack(await this.db.prepare('SELECT item_json, version FROM workbench_items WHERE owner_id = ? AND item_id = ?')
      .bind(this.ownerId, id).first());
  }
  async deleted(id) { return this.db.prepare('SELECT version, deleted_at FROM deleted_items WHERE owner_id = ? AND item_id = ?').bind(this.ownerId, id).first(); }
  changeStatement(response, changed = true) {
    return this.db.prepare(`INSERT OR IGNORE INTO item_changes(owner_id, item_id, version, deleted, record_json, changed_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1 AND ? = 1`)
      .bind(this.ownerId, response.item?.id ?? response.id, response.version, response.deleted ? 1 : 0, response.deleted ? null : JSON.stringify(response), new Date().toISOString(), changed ? 1 : 0);
  }
  async changes({ since, until, limit }) {
    const maximum = await this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM item_changes WHERE owner_id = ?').bind(this.ownerId).first();
    const high = until === undefined ? maximum.seq : Number(until);
    if (high > maximum.seq || Number(since) > high) throw new ApiError(400, 'INVALID_CURSOR', '同步游标无效，未修改本机内容。');
    const { results } = await this.db.prepare(`SELECT seq, item_id, version, deleted, record_json FROM item_changes
      WHERE owner_id = ? AND seq > ? AND seq <= ? AND ${personalOnly} ORDER BY seq LIMIT ?`).bind(this.ownerId, Number(since), high, ...KNOWN_TEST_IDS, limit + 1).all();
    const selected = results.slice(0, limit);
    const hasMore = results.length > limit;
    return { changes: selected.map(row => ({ seq: String(row.seq), id: row.item_id, version: row.version, deleted: Boolean(row.deleted), record: row.record_json ? JSON.parse(row.record_json) : null })), cursor: String(hasMore ? selected.at(-1).seq : high), until: String(high), hasMore };
  }
  async list({ type, includeCompleted, limit, offset }) {
    // 网页与 MCP 共用正式列表；只排除有明确联调证据的 ID，不按标题删除或判断身份。
    const clauses = ['owner_id = ?', personalOnly];
    const values = [this.ownerId, ...KNOWN_TEST_IDS];
    if (type) { clauses.push("json_extract(item_json, '$.type') = ?"); values.push(type); }
    if (!includeCompleted) clauses.push("COALESCE(json_extract(item_json, '$.done'), 0) = 0 AND COALESCE(json_extract(item_json, '$.status'), '') <> 'done'");
    const { results } = await this.db.prepare(`SELECT item_json, version FROM workbench_items WHERE ${clauses.join(' AND ')}
      ORDER BY json_extract(item_json, '$.createdAt') DESC, item_id DESC LIMIT ? OFFSET ?`)
      .bind(...values, limit + 1, offset).all();
    return { items: results.slice(0, limit).map(unpack), nextOffset: results.length > limit ? offset + limit : null };
  }
  async receipt(requestId, expectedFingerprint) {
    const row = await this.db.prepare('SELECT fingerprint, response_json FROM mutation_receipts WHERE owner_id = ? AND request_id = ?')
      .bind(this.ownerId, requestId).first();
    if (!row) return null;
    if (row.fingerprint !== expectedFingerprint) throw new ApiError(409, 'REQUEST_ID_REUSED', '请求标识已用于不同内容，请为新操作使用新标识。');
    return JSON.parse(row.response_json);
  }
  receiptStatement(requestId, hash, response) {
    // 必须紧随事项写入且在同一个 D1 batch 中执行：只有前一条语句成功才记录回执。
    return this.db.prepare(`INSERT INTO mutation_receipts(owner_id, request_id, fingerprint, response_json, created_at)
      SELECT ?, ?, ?, ?, ? WHERE changes() = 1`)
      .bind(this.ownerId, requestId, hash, JSON.stringify(response), new Date().toISOString());
  }
  async create(requestId, hash, item) {
    const replay = await this.receipt(requestId, hash);
    if (replay) return replay;
    const response = { item, version: 1 };
    // D1 batch 是事务：事项与回执一起提交，重复请求不能生成第二条记录。
    await this.db.batch([
      this.db.prepare(`INSERT INTO workbench_items(owner_id, item_id, item_json, version)
        SELECT ?, ?, ?, 1 WHERE NOT EXISTS(SELECT 1 FROM mutation_receipts WHERE owner_id = ? AND request_id = ?)
        AND NOT EXISTS(SELECT 1 FROM workbench_items WHERE owner_id = ? AND item_id = ?)
        AND NOT EXISTS(SELECT 1 FROM deleted_items WHERE owner_id = ? AND item_id = ?)`)
        .bind(this.ownerId, item.id, JSON.stringify(item), this.ownerId, requestId, this.ownerId, item.id, this.ownerId, item.id),
      this.receiptStatement(requestId, hash, response),
      this.changeStatement(response),
    ]);
    const committed = await this.receipt(requestId, hash);
    if (!committed) {
      if (await this.deleted(item.id)) throw new ApiError(410, 'ITEM_DELETED', '该 ID 已删除，不能由旧设备重新创建。');
      if (await this.get(item.id)) throw new ApiError(409, 'ITEM_ID_EXISTS', '此 ID 已存在，请读取后比较。');
      throw new ApiError(503, 'SAVE_UNAVAILABLE', '写入未确认，请保留原请求标识重试。');
    }
    return committed;
  }
  async update(requestId, hash, current, item) {
    const replay = await this.receipt(requestId, hash);
    if (replay) return replay;
    const unchanged = item === current.item;
    const version = current.version + (unchanged ? 0 : 1);
    const response = { item, version };
    await this.db.batch([
      this.db.prepare(`UPDATE workbench_items SET item_json = ?, version = ?
        WHERE owner_id = ? AND item_id = ? AND version = ?
        AND NOT EXISTS(SELECT 1 FROM mutation_receipts WHERE owner_id = ? AND request_id = ?)`)
        .bind(JSON.stringify(item), version, this.ownerId, item.id, current.version, this.ownerId, requestId),
      this.receiptStatement(requestId, hash, response),
      this.changeStatement(response, !unchanged),
    ]);
    const committed = await this.receipt(requestId, hash);
    if (!committed) throw new ApiError(409, 'VERSION_CONFLICT', '记录已变化，请重新读取并与当前修改比较。');
    return committed;
  }
  async remove(requestId, hash, current) {
    const replay = await this.receipt(requestId, hash);
    if (replay) return replay;
    const response = { id: current.item.id, version: current.version + 1, deleted: true };
    const at = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO deleted_items(owner_id, item_id, version, deleted_at)
        SELECT owner_id, item_id, version + 1, ? FROM workbench_items WHERE owner_id = ? AND item_id = ? AND version = ?
        AND NOT EXISTS(SELECT 1 FROM mutation_receipts WHERE owner_id = ? AND request_id = ?)`).bind(at, this.ownerId, current.item.id, current.version, this.ownerId, requestId),
      this.db.prepare('DELETE FROM workbench_items WHERE owner_id = ? AND item_id = ? AND version = ? AND changes() = 1').bind(this.ownerId, current.item.id, current.version),
      this.receiptStatement(requestId, hash, response),
      this.changeStatement(response),
      // 删除转换目标时仅解除关联，保留随笔其他字段。日志与解除在同一事务中提交。
      this.db.prepare(`INSERT OR IGNORE INTO item_changes(owner_id, item_id, version, deleted, record_json, changed_at)
        SELECT owner_id, item_id, version + 1, 0, json_object('item', json(json_set(json_remove(item_json, '$.convertedToId', '$.convertedToType', '$.convertedAt'), '$.updatedAt', ?)), 'version', version + 1), ?
        FROM workbench_items WHERE owner_id = ? AND json_extract(item_json, '$.convertedToId') = ?
        AND EXISTS(SELECT 1 FROM mutation_receipts WHERE owner_id = ? AND request_id = ? AND fingerprint = ?)`)
        .bind(at, at, this.ownerId, current.item.id, this.ownerId, requestId, hash),
      this.db.prepare(`UPDATE workbench_items SET item_json = json_set(json_remove(item_json, '$.convertedToId', '$.convertedToType', '$.convertedAt'), '$.updatedAt', ?), version = version + 1
        WHERE owner_id = ? AND json_extract(item_json, '$.convertedToId') = ?
        AND EXISTS(SELECT 1 FROM mutation_receipts WHERE owner_id = ? AND request_id = ? AND fingerprint = ?)`)
        .bind(at, this.ownerId, current.item.id, this.ownerId, requestId, hash),
    ]);
    const committed = await this.receipt(requestId, hash);
    if (!committed) throw new ApiError(409, 'VERSION_CONFLICT', '删除发生版本冲突，原修改保留。');
    return committed;
  }
}
