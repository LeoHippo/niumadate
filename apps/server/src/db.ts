import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * 这里刻意不用 `import ... from 'node:sqlite'`：
 * tsup/esbuild 会把 node: 前缀吃掉，产出 `from "sqlite"`，
 * 而 Node 只提供带前缀的 node:sqlite，运行时会报
 * "Cannot find package 'sqlite'"。改成运行时 require 就绕开了打包器。
 */
const require = createRequire(import.meta.url);
const sqlite = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };

/**
 * 打开（必要时创建）SQLite 数据库并建表。
 * 用 Node 内置的 node:sqlite，避免 better-sqlite3 那类需要编译的原生模块。
 */
export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const database = new sqlite.DatabaseSync(join(dataDir, 'app.db'));

  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS submissions (
      id            TEXT PRIMARY KEY,
      role          TEXT NOT NULL,
      name          TEXT NOT NULL,
      device_id     TEXT NOT NULL,
      slots         TEXT NOT NULL,
      custom_times  TEXT NOT NULL,
      place         TEXT,
      message       TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'pending',
      admin_note    TEXT NOT NULL DEFAULT '',
      meeting_note  TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_device ON submissions (device_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_role ON submissions (role);
  `);

  // 老库平滑升级：缺列就补，不动已有数据
  ensureColumn(database, 'submissions', 'meeting_note', "TEXT NOT NULL DEFAULT ''");

  return database;
}

/** 表里没有这一列就加上。 */
function ensureColumn(
  database: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{
    name: string;
  }>;
  if (columns.some((item) => item.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
