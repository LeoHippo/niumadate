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

/**
 * 安全的 localStorage 读写。
 *
 * **为什么必须包一层**：手机浏览器里 localStorage 会**直接抛异常**，
 * 不是优雅地返回 null —— 微信内置浏览器、无痕模式、用户禁用了存储、
 * 配额满了，都会抛。一旦抛出来又没人接住，**整页白屏**。
 *
 * 这个 bug 真的发生过，也真的复现过：入口页正常（它不碰存储），
 * 一点进「选日期」那页就白屏（那页要读设备号）。好友只会以为链接坏了。
 *
 * 所以这里全部兜住：拿不到就当「这台设备没有存储」，
 * 功能降级（记不住人、存不住草稿），但**页面照常能用**。
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // 存不下就算了。这一次的填写不受影响，只是下次回来认不出人。
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 同上
    }
  },
};

/**
 * 生成一个随机 id。
 *
 * `crypto.randomUUID` 在 **iOS 15.4 以下的 Safari / 微信内置浏览器**里不存在 ——
 * 直接调用会抛 "not a function"，而那又会让整页白屏。所以要有退路。
 * 这个 id 只是「认人」用的，不需要密码学强度，时间戳 + 随机数足够。
 */
function randomId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      // 落到下面的退路
    }
  }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 浏览器生成的随机设备号，用来让好友下次进来还能看到自己的申请。 */
export function getDeviceId(): string {
  const existing = safeStorage.get(DEVICE_KEY);
  if (existing !== null && existing !== '') return existing;
  const created = randomId();
  safeStorage.set(DEVICE_KEY, created);
  return created;
}

const OPENED_KEY = 'niumadate.openedInvites';

/**
 * 记下「这台设备点开过哪几份邀请」。
 *
 * 为什么需要：邀请是**牛马创建**的，服务端不知道谁会点开，
 * 所以没法像申请那样「按设备号反查」。只能靠链接里那串码 ——
 * 他点开一次就记住了，之后能在「我的记录」里翻到。
 *
 * 代价和申请一样：清缓存 / 换浏览器就丢。「我的记录」里已经解释过一遍了。
 */
export function rememberInvite(code: string): void {
  if (code === '') return;
  const list = openedInvites().filter((item) => item !== code);
  list.unshift(code);
  // 只留最近 30 份，别让 localStorage 无限长大
  safeStorage.set(OPENED_KEY, JSON.stringify(list.slice(0, 30)));
}

/** 这台设备点开过的邀请码，最近的在最前。 */
export function openedInvites(): string[] {
  const raw = safeStorage.get(OPENED_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
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
  safeStorage.set(draftKey(role), JSON.stringify(draft));
}

export function clearDraft(role: string): void {
  safeStorage.remove(draftKey(role));
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
