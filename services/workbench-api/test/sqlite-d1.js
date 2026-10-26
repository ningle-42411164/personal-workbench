import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// 用真正的 SQLite 验证 D1 SQL、事务、changes() 和唯一约束；不是 Map 模拟存储。
export function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const wrap = (query, args = []) => ({
    bind(...values) { return wrap(query, values); },
    async first() { return sqlite.prepare(query).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(query).all(...args) }; },
    run() { return { meta: sqlite.prepare(query).run(...args) }; },
  });
  return {
    prepare: query => wrap(query),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(statement => statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close() { sqlite.close(); },
  };
}
