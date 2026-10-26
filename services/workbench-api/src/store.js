import { ApiError } from './errors.js';

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
  async list({ type, includeCompleted, limit, offset }) {
    const clauses = ['owner_id = ?'];
    const values = [this.ownerId];
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
        SELECT ?, ?, ?, 1 WHERE NOT EXISTS(SELECT 1 FROM mutation_receipts WHERE owner_id = ? AND request_id = ?)`)
        .bind(this.ownerId, item.id, JSON.stringify(item), this.ownerId, requestId),
      this.receiptStatement(requestId, hash, response),
    ]);
    const committed = await this.receipt(requestId, hash);
    if (!committed) throw new ApiError(503, 'SAVE_UNAVAILABLE', '写入未确认，请保留原请求标识重试。');
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
    ]);
    const committed = await this.receipt(requestId, hash);
    if (!committed) throw new ApiError(409, 'VERSION_CONFLICT', '记录已变化，请重新读取并与当前修改比较。');
    return committed;
  }
}
