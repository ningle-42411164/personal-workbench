-- 仅测试服务的增量协议；不读取、导入或改写浏览器本机事项。
CREATE TABLE IF NOT EXISTS deleted_items (
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, item_id)
);
CREATE TABLE IF NOT EXISTS item_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  deleted INTEGER NOT NULL CHECK(deleted IN (0, 1)),
  record_json TEXT CHECK(record_json IS NULL OR json_valid(record_json)),
  changed_at TEXT NOT NULL,
  UNIQUE(owner_id, item_id, version)
);
CREATE INDEX IF NOT EXISTS item_changes_owner_seq ON item_changes(owner_id, seq);
-- 为已有虚构云端测试记录建立初始游标，事项本身和历史保持原值。
INSERT OR IGNORE INTO item_changes(owner_id, item_id, version, deleted, record_json, changed_at)
  SELECT owner_id, item_id, version, 0,
    json_object('item', json(item_json), 'version', version), json_extract(item_json, '$.updatedAt')
  FROM workbench_items;
