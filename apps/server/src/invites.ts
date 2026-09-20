import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { makeInviteCode } from '@niumadate/shared';
import type {
  CreateInviteInput,
  Invite,
  InviteMessage,
  InviteSpeaker,
  InviteStatus,
  RoleKey,
} from '@niumadate/shared';
import { openDatabase } from './db';
import { log } from './log';

let database: DatabaseSync | null = null;

/** 进程启动时调用一次。和 submissions 共用同一个库文件。 */
export function initInvites(dataDir: string): void {
  database = openDatabase(dataDir);
  log().info({ dataDir }, '邀请表已就绪');
}

function db(): DatabaseSync {
  if (database === null) throw new Error('invites 还没初始化');
  return database;
}

interface InviteRow {
  id: string;
  code: string;
  role: string;
  invitee_name: string;
  date: string;
  time_text: string;
  place: string;
  activity: string;
  title: string;
  greeting: string;
  body: string;
  signature: string;
  no_decline: number;
  status: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  invite_id: string;
  sender: string;
  text: string;
  created_at: string;
}

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    code: row.code,
    role: row.role as RoleKey,
    inviteeName: row.invitee_name,
    date: row.date,
    timeText: row.time_text,
    place: row.place,
    activity: row.activity,
    title: row.title,
    greeting: row.greeting,
    body: row.body,
    signature: row.signature,
    noDecline: row.no_decline !== 0,
    status: row.status as InviteStatus,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): InviteMessage {
  return {
    id: row.id,
    inviteId: row.invite_id,
    from: row.sender as InviteSpeaker,
    text: row.text,
    createdAt: row.created_at,
  };
}

/**
 * 建一条邀请。
 *
 * code 顺手重试几次：理论上撞不上（22 位），但撞了就该重来，
 * 而不是把 UNIQUE 约束的错误抛给用户。
 */
export function createInvite(input: CreateInviteInput): Invite {
  const now = new Date().toISOString();
  const id = randomUUID();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeInviteCode((size) => randomBytes(size));
    try {
      db()
        .prepare(
          `INSERT INTO invites (
             id, code, role, invitee_name, date, time_text, place, activity,
             title, greeting, body, signature, no_decline, status, responded_at,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`,
        )
        .run(
          id,
          code,
          input.role,
          input.inviteeName,
          input.date,
          input.timeText,
          input.place,
          input.activity,
          input.title,
          input.greeting,
          input.body,
          input.signature,
          input.noDecline ? 1 : 0,
          now,
          now,
        );
      const created = getInviteById(id);
      if (created !== null) return created;
    } catch {
      // 撞码了（几乎不可能），换一个再来
    }
  }
  throw new Error('生成邀请码失败，试了 5 次都撞上了');
}

export function listInvites(): Invite[] {
  const rows = db()
    .prepare('SELECT * FROM invites ORDER BY created_at DESC')
    .all() as unknown as InviteRow[];
  return rows.map(toInvite);
}

export function getInviteById(id: string): Invite | null {
  const row = db().prepare('SELECT * FROM invites WHERE id = ?').get(id) as unknown as
    | InviteRow
    | undefined;
  return row === undefined ? null : toInvite(row);
}

/** 好友那一侧就是按码找人。*/
export function getInviteByCode(code: string): Invite | null {
  const row = db().prepare('SELECT * FROM invites WHERE code = ?').get(code) as unknown as
    | InviteRow
    | undefined;
  return row === undefined ? null : toInvite(row);
}

/** 后台能改的字段。只给传进来的字段动刀，没传的保持原样。 */
export function updateInvite(id: string, patch: Partial<CreateInviteInput>): Invite | null {
  const current = getInviteById(id);
  if (current === null) return null;

  const next = {
    role: patch.role ?? current.role,
    inviteeName: patch.inviteeName ?? current.inviteeName,
    date: patch.date ?? current.date,
    timeText: patch.timeText ?? current.timeText,
    place: patch.place ?? current.place,
    activity: patch.activity ?? current.activity,
    title: patch.title ?? current.title,
    greeting: patch.greeting ?? current.greeting,
    body: patch.body ?? current.body,
    signature: patch.signature ?? current.signature,
    noDecline: patch.noDecline ?? current.noDecline,
  };

  db()
    .prepare(
      `UPDATE invites SET
         role = ?, invitee_name = ?, date = ?, time_text = ?, place = ?, activity = ?,
         title = ?, greeting = ?, body = ?, signature = ?, no_decline = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      next.role,
      next.inviteeName,
      next.date,
      next.timeText,
      next.place,
      next.activity,
      next.title,
      next.greeting,
      next.body,
      next.signature,
      next.noDecline ? 1 : 0,
      new Date().toISOString(),
      id,
    );

  return getInviteById(id);
}

export function deleteInvite(id: string): boolean {
  db().prepare('DELETE FROM invite_messages WHERE invite_id = ?').run(id);
  const result = db().prepare('DELETE FROM invites WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

/**
 * 好友回应。
 *
 * **允许改** —— 现实里确实会变卦，让人改比逼他微信来找你强。
 * 每次改都刷新 responded_at，所以后台看得出来「他后来又改过」。
 *
 * 勾了「不允许拒绝」的邀请不接受 declined：服务端也要拦，
 * 不能只靠前端把按钮藏起来。
 */
export function respondToInvite(
  code: string,
  status: Exclude<InviteStatus, 'pending'>,
): { ok: true; invite: Invite } | { ok: false; reason: 'notfound' | 'no-decline' } {
  const current = getInviteByCode(code);
  if (current === null) return { ok: false, reason: 'notfound' };
  if (status === 'declined' && current.noDecline) return { ok: false, reason: 'no-decline' };

  const now = new Date().toISOString();
  db()
    .prepare('UPDATE invites SET status = ?, responded_at = ?, updated_at = ? WHERE code = ?')
    .run(status, now, now, code);

  const updated = getInviteByCode(code);
  if (updated === null) return { ok: false, reason: 'notfound' };
  return { ok: true, invite: updated };
}

export function listMessages(inviteId: string): InviteMessage[] {
  const rows = db()
    .prepare('SELECT * FROM invite_messages WHERE invite_id = ? ORDER BY created_at ASC')
    .all(inviteId) as unknown as MessageRow[];
  return rows.map(toMessage);
}

export function addMessage(inviteId: string, from: InviteSpeaker, text: string): InviteMessage {
  const trimmed = text.trim();
  if (trimmed === '') throw new Error('留言不能是空的');
  const now = new Date().toISOString();
  const id = randomUUID();
  db()
    .prepare('INSERT INTO invite_messages (id, invite_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, inviteId, from, trimmed, now);
  return { id, inviteId, from, text: trimmed, createdAt: now };
}
