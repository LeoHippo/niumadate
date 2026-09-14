import type {
  AppConfig,
  DayRow,
  LockMode,
  SeasonConfig,
  SlotCell,
  SlotDef,
  WorkSchedule,
} from './types';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** 兜底工作制：万一配置被改坏，也不要让页面直接崩。 */
export const FALLBACK_SCHEDULE: WorkSchedule = {
  key: 'fallback',
  label: '未知',
  workdays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '18:00',
};

/** 本地时区的 YYYY-MM-DD（不要用 toISOString，会跑到 UTC 去）。 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 红头文件的文号。
 *
 * 刻意**不做成配置项**：年份跟着当前年份走，跨年自动更新，
 * 后台想改也改不了（省得有人把它改成奇怪的字符串，红头就不像红头了）。
 */
export function buildDocNumber(date: Date = new Date()): string {
  return `牛马字〔${date.getFullYear()}〕1 号`;
}

/** 2026-09-13 加 1 天 → 2026-09-14。 */
export function addDaysKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** 两个日期差几天（a - b）。 */
export function daysBetween(a: string, b: string): number {
  const toTime = (key: string): number => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getTime();
  };
  return Math.round((toTime(a) - toTime(b)) / 86400000);
}

/** ISO 星期：1 = 周一 … 7 = 周日。 */
export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/** "09:30" -> 570（分钟）。 */
export function parseHm(value: string): number {
  const [h, m] = value.split(':');
  const hours = Number.parseInt(h ?? '', 10);
  const minutes = Number.parseInt(m ?? '', 10);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** 判断某个时段在某天是否被工作冻住。 */
export function isSlotLocked(
  weekday: number,
  slot: SlotDef,
  schedule: WorkSchedule,
  mode: LockMode,
): boolean {
  if (!schedule.workdays.includes(weekday)) return false;
  const slotStart = parseHm(slot.start);
  const slotEnd = parseHm(slot.end);
  const workStart = parseHm(schedule.workStart);
  const workEnd = parseHm(schedule.workEnd);
  return mode === 'overlap'
    ? overlaps(slotStart, slotEnd, workStart, workEnd)
    : slotStart >= workStart && slotEnd <= workEnd;
}

/**
 * 哪个时段带哪种情绪。
 *
 * 夏天最热的是**中午**，冬天最冷的是**晚上** —— 按生活经验定的，不是随手挑的。
 */
const HOT_SLOT = 'noon';
const COLD_SLOT = 'evening';

/**
 * 这个时段在这个月该显什么情绪；不在对应月份列表里就返回 null。
 *
 * 注意「热」和「冷」是挂在**不同时段**上的：中午热、晚上冷。
 */
export function slotMoodOf(
  dateKey: string,
  slotKey: string,
  season: SeasonConfig,
): 'hot' | 'cold' | null {
  const month = Number.parseInt(dateKey.slice(5, 7), 10);
  if (slotKey === HOT_SLOT && season.hotMonths.includes(month)) return 'hot';
  if (slotKey === COLD_SLOT && season.coldMonths.includes(month)) return 'cold';
  return null;
}

/** 当前生效的工作制。 */
export function activeSchedule(config: AppConfig): WorkSchedule {
  const active = config.schedule.presets.find((preset) => preset.key === config.schedule.active);
  return active ?? config.schedule.presets[0] ?? FALLBACK_SCHEDULE;
}

/** 2026-09-13 -> 9月13日 周日 */
export function formatDayLabel(date: Date): string {
  const weekday = WEEKDAY_LABELS[isoWeekday(date) - 1] ?? '';
  return `${date.getMonth() + 1}月${date.getDate()}日 周${weekday}`;
}

/** 生成「未来 N 天 × 各时段」的网格。 */
export function buildDayRows(config: AppConfig, today: Date = new Date()): DayRow[] {
  const schedule = activeSchedule(config);
  const rows: DayRow[] = [];

  for (let offset = 0; offset < config.dateRangeDays; offset += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const date = toDateKey(day);
    const weekday = isoWeekday(day);

    const cells: SlotCell[] = config.slots.map((slot) => {
      // 时段本身不开放优先于工作时段冻结：早上永远是「只看看」
      const blockReason = !slot.selectable
        ? ('display' as const)
        : isSlotLocked(weekday, slot, schedule, config.schedule.lockMode)
          ? ('work' as const)
          : null;

      return {
        date,
        weekday,
        slot: slot.key,
        selectable: blockReason === null,
        blockReason,
        mood: slotMoodOf(date, slot.key, config.season),
      };
    });

    const prefix = offset === 0 ? '今天 · ' : offset === 1 ? '明天 · ' : '';
    rows.push({ date, weekday, label: `${prefix}${formatDayLabel(day)}`, cells });
  }

  return rows;
}
