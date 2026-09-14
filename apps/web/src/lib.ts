import { activeSchedule, addDaysKey, copiesFor, toDateKey, withName } from '@niumadate/shared';
import type {
  AppConfig,
  CopiesConfig,
  CustomTime,
  SlotCell,
  SlotDef,
  RoleKey,
  Submission,
  SubmissionStatus,
} from '@niumadate/shared';

const DEVICE_KEY = 'niumadate.deviceId';

/** 浏览器生成的随机设备号，用来让好友下次进来还能看到自己的申请。 */
export function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing !== null && existing !== '') return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

/** 一个「日期 + 时段」组合的稳定 key。 */
export function slotKey(date: string, slot: string): string {
  return `${date}|${slot}`;
}

export interface Draft {
  name: string;
  slots: string[];
  customTimes: CustomTime[];
  place: string;
  placeDecided: boolean;
  message: string;
  /** 好友提的见面要求。 */
  meetingNote: string;
}

export function emptyDraft(): Draft {
  return {
    name: '',
    slots: [],
    customTimes: [],
    place: '',
    placeDecided: false,
    message: '',
    meetingNote: '',
  };
}

function draftKey(role: string): string {
  return `niumadate.draft.${role}`;
}

/** 填一半误关、刷新，回来还在。 */
export function loadDraft(role: string): Draft {
  try {
    const raw = window.localStorage.getItem(draftKey(role));
    if (raw === null) return emptyDraft();
    return { ...emptyDraft(), ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    return emptyDraft();
  }
}

export function saveDraft(role: string, draft: Draft): void {
  window.localStorage.setItem(draftKey(role), JSON.stringify(draft));
}

export function clearDraft(role: string): void {
  window.localStorage.removeItem(draftKey(role));
}

/** 把 {name} 占位符换成昵称。 */
export function fillCopy(template: string, name: string): string {
  return withName(template, name === '' ? '朋友' : name);
}

/** 把「几点」和「干嘛」拼成一条自定义时间。 */
export function composeCustomText(time: string, activity: string): string {
  const left = time.trim();
  const right = activity.trim();
  if (left === '') return right;
  if (right === '') return left;
  return `${left} · ${right}`;
}

export function slotLabel(config: AppConfig, key: string): string {
  return config.slots.find((slot) => slot.key === key)?.label ?? key;
}

export function slotDef(config: AppConfig, key: string): SlotDef | undefined {
  return config.slots.find((slot) => slot.key === key);
}

/** 「9月14日 周一 · 晚上」这样的一句话。 */
export function describeSelection(config: AppConfig, date: string, slot: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日 ${slotLabel(config, slot)}`;
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: '待审批',
  accepted: '已批准',
  cancelled: '已驳回',
};

/** 回执上的主文案 + 副文案。 */
export function statusCopy(
  status: SubmissionStatus,
  copies: CopiesConfig,
): { headline: string; sub: string } {
  if (status === 'accepted') return { headline: copies.accepted, sub: copies.acceptedSub };
  if (status === 'cancelled') return { headline: copies.rejected, sub: '' };
  return { headline: copies.pending, sub: copies.pendingSub };
}

/** 提取这条申请里最晚的一个日期。 */
function latestDate(submission: Submission): string {
  const dates = [
    ...submission.slots.map((slot) => slot.date),
    ...submission.customTimes.map((item) => item.date),
  ];
  return dates.sort().at(-1) ?? submission.createdAt.slice(0, 10);
}

/** 这条申请里最晚的日期。 */
export function latestDateOf(submission: Submission): string {
  return latestDate(submission);
}

/**
 * 还要不要显示回执。
 *
 * 两种情况会放好友重新填写：
 *   1. 后台把这条驳回了（cancelled）
 *   2. 约会日期过去到「第二天」（config.reopenAfterDays 可调）
 */
export function isSubmissionActive(
  submission: Submission,
  reopenAfterDays: number,
  today: Date = new Date(),
): boolean {
  if (submission.status === 'cancelled') return false;
  const reopenOn = addDaysKey(latestDate(submission), reopenAfterDays);
  return toDateKey(today) < reopenOn;
}

/** 时段被工作冻住时，给一句人话解释。 */
export function lockReason(config: AppConfig, weekday: number, slot: SlotDef): string {
  const schedule = activeSchedule(config);
  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
  const day = dayNames[weekday - 1] ?? '';
  return `周${day} ${schedule.workStart}-${schedule.workEnd} 牛马在上班，${slot.label}这段被冻住了`;
}

/** 统一解释「为什么这个格子不能选」。文案按身份取，四个身份口气不一样。 */
export function blockReasonText(
  config: AppConfig,
  cell: SlotCell,
  slot: SlotDef,
  roleKey: RoleKey | undefined,
): string {
  if (cell.blockReason === 'display') return copiesFor(config, roleKey).displayOnly;
  return lockReason(config, cell.weekday, slot);
}

/** 2026-09-14 -> 9月14日 周一 */
export function shortDate(date: string): string {
  const parts = date.split('-');
  const month = Number(parts[1] ?? 1);
  const day = Number(parts[2] ?? 1);
  return `${month}月${day}日`;
}
