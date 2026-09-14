import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CustomTime, SlotSelection, Submission, SubmissionStatus } from '@niumadate/shared';
import { openDatabase } from './db';
import { log } from './log';

let database: DatabaseSync | null = null;

/** 进程启动时调用一次。 */
export function initSubmissions(dataDir: string): void {
  database = openDatabase(dataDir);
  log().info({ dataDir }, 'SQLite 已打开');
}

function db(): DatabaseSync {
  if (database === null) throw new Error('submissions 还没初始化');
  return database;
}

interface SubmissionRow {
  id: string;
  role: string;
  name: string;
  device_id: string;
  slots: string;
  custom_times: string;
  place: string | null;
  message: string;
  status: string;
  admin_note: string;
  meeting_note: string;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    role: row.role as Submission['role'],
    name: row.name,
    deviceId: row.device_id,
    slots: parseJson<SlotSelection[]>(row.slots, []),
    customTimes: parseJson<CustomTime[]>(row.custom_times, []),
    place: row.place,
    message: row.message,
    status: row.status as SubmissionStatus,
    adminNote: row.admin_note,
    meetingNote: row.meeting_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewSubmission {
  role: Submission['role'];
  name: string;
  deviceId: string;
  slots: SlotSelection[];
  customTimes: CustomTime[];
  place: string | null;
  message: string;
  meetingNote: string;
}

/** 新增一条提交记录。 */
export function createSubmission(input: NewSubmission): Submission {
  const now = new Date().toISOString();
  const submission: Submission = {
    id: randomUUID(),
    role: input.role,
    name: input.name,
    deviceId: input.deviceId,
    slots: input.slots,
    customTimes: input.customTimes,
    place: input.place,
    message: input.message,
    status: 'pending',
    adminNote: '',
    meetingNote: input.meetingNote,
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare(
      `INSERT INTO submissions
         (id, role, name, device_id, slots, custom_times, place, message, status, admin_note, meeting_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      submission.id,
      submission.role,
      submission.name,
      submission.deviceId,
      JSON.stringify(submission.slots),
      JSON.stringify(submission.customTimes),
      submission.place,
      submission.message,
      submission.status,
      submission.adminNote,
      submission.meetingNote,
      submission.createdAt,
      submission.updatedAt,
    );

  log().info(
    {
      id: submission.id,
      role: submission.role,
      name: submission.name,
      deviceId: submission.deviceId,
      slots: submission.slots.length,
      customTimes: submission.customTimes.length,
      place: submission.place ?? '【由你定】',
      messageLength: submission.message.length,
      meetingNote: submission.meetingNote,
    },
    '收到一条新的约会申请',
  );

  return submission;
}

export interface ListFilter {
  role?: string | undefined;
  status?: string | undefined;
}

/** 倒序列出提交记录。 */
export function listSubmissions(filter: ListFilter = {}): Submission[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter.role !== undefined && filter.role !== '') {
    clauses.push('role = ?');
    params.push(filter.role);
  }
  if (filter.status !== undefined && filter.status !== '') {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db()
    .prepare(`SELECT * FROM submissions ${where} ORDER BY created_at DESC`)
    .all(...params) as unknown as SubmissionRow[];
  return rows.map(toSubmission);
}

export function getSubmission(id: string): Submission | undefined {
  const row = db().prepare('SELECT * FROM submissions WHERE id = ?').get(id) as unknown as
    | SubmissionRow
    | undefined;
  return row === undefined ? undefined : toSubmission(row);
}

/** 同一台设备 + 同一身份，取最近一条。 */
export function findLatestByDevice(deviceId: string, role: string): Submission | undefined {
  const row = db()
    .prepare('SELECT * FROM submissions WHERE device_id = ? AND role = ? ORDER BY created_at DESC LIMIT 1')
    .get(deviceId, role) as unknown as SubmissionRow | undefined;
  return row === undefined ? undefined : toSubmission(row);
}

export interface SubmissionPatch {
  status?: SubmissionStatus | undefined;
  adminNote?: string | undefined;
  place?: string | null | undefined;
}

export function updateSubmission(id: string, patch: SubmissionPatch): Submission | undefined {
  const current = getSubmission(id);
  if (current === undefined) return undefined;

  const next: Submission = {
    ...current,
    status: patch.status ?? current.status,
    adminNote: patch.adminNote ?? current.adminNote,
    // meetingNote 是好友填的，后台不改
    meetingNote: current.meetingNote,
    place: patch.place === undefined ? current.place : patch.place,
    updatedAt: new Date().toISOString(),
  };

  db()
    .prepare(
      'UPDATE submissions SET status = ?, admin_note = ?, meeting_note = ?, place = ?, updated_at = ? WHERE id = ?',
    )
    .run(next.status, next.adminNote, next.meetingNote, next.place, next.updatedAt, id);

  const changed: string[] = [];
  if (next.status !== current.status) changed.push(`status: ${current.status} → ${next.status}`);
  if (next.adminNote !== current.adminNote) changed.push('adminNote');
  if (next.place !== current.place) {
    changed.push(`place: ${current.place ?? '【由你定】'} → ${next.place ?? '【由你定】'}`);
  }

  log().info({ id, name: current.name, changed }, '审批记录已更新');

  return next;
}

export function deleteSubmission(id: string): boolean {
  const existing = getSubmission(id);
  const result = db().prepare('DELETE FROM submissions WHERE id = ?').run(id);
  const removed = Number(result.changes) > 0;

  if (removed) {
    log().warn({ id, name: existing?.name, role: existing?.role }, '删掉了一条约会申请');
  }

  return removed;
}

export function countSubmissions(): number {
  const row = db().prepare('SELECT COUNT(*) AS n FROM submissions').get() as unknown as { n: number };
  return Number(row.n);
}
