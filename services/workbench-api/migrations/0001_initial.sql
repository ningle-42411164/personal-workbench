-- 只初始化新的隔离服务；不会读取或迁移浏览器 localStorage。
CREATE TABLE IF NOT EXISTS workbench_items (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_json TEXT NOT NULL CHECK(json_valid(item_json)),
  version INTEGER NOT NULL CHECK(version > 0),
  PRIMARY KEY(owner_id, item_id)
);
CREATE TABLE IF NOT EXISTS mutation_receipts (
  owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, request_id)
);
