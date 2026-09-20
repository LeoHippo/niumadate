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

    /*
      邀请：牛马创建的，一条一条独立，不像申请那样按身份归堆。
      code 是链接里那串，也是**唯一的访问凭据** —— 拿到就能看，所以要够长。
    */
    CREATE TABLE IF NOT EXISTS invites (
      id             TEXT PRIMARY KEY,
      code           TEXT NOT NULL UNIQUE,
      role           TEXT NOT NULL,
      invitee_name   TEXT NOT NULL DEFAULT '',
      date           TEXT NOT NULL,
      time_text      TEXT NOT NULL DEFAULT '',
      place          TEXT NOT NULL DEFAULT '',
      activity       TEXT NOT NULL DEFAULT '',
      title          TEXT NOT NULL DEFAULT '',
      greeting       TEXT NOT NULL DEFAULT '',
      body           TEXT NOT NULL DEFAULT '',
      signature      TEXT NOT NULL DEFAULT '',
      no_decline     INTEGER NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'pending',
      responded_at   TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invites_created ON invites (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invites_code ON invites (code);

    /*
      邀请里的留言。**这是这个功能的重点** ——
      定下来之后还要来回商量，所以是一串消息，不是单条备注。
    */
    CREATE TABLE IF NOT EXISTS invite_messages (
      id          TEXT PRIMARY KEY,
      invite_id   TEXT NOT NULL,
      sender      TEXT NOT NULL,
      text        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invite_messages_invite ON invite_messages (invite_id, created_at);
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
