import type {
  AppConfig,
  CopiesConfig,
  RoleCopies,
  LockMode,
  PlaceConfig,
  RoleConfig,
  RoleKey,
  SeasonConfig,
  ScheduleConfig,
  SiteConfig,
  SlotDef,
  ThemeKey,
  WorkSchedule,
} from './types';
import { ROLE_KEYS, THEME_KEYS } from './types';
import { defaultCopies } from './voices';

/** 出厂配置。后台没存过 config.json 时就用它。 */
export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  site: {
    title: '非工作时间约会审批系统',
    subtitle: '牛马出栏审批处 · 上班时间概不受理',

    open: true,
  },
  roles: [
    {
      key: 'brother',
      label: '好兄弟',
      tagline: '喝酒随叫随到，早起恕不奉陪',
      emoji: '🍻',
      theme: 'brother',
      askName: true,
      nameDefault: '',
      enabled: true,
      closedText: '你没错，但你不是我好兄弟！',
      // 每套话都有男生版 / 女生版，见 voices.ts
      copies: defaultCopies('brother'),
    },
    {
      key: 'sister',
      label: '好姐妹',
      tagline: '逛街拍照都行，记得先给我修图',
      emoji: '💅',
      theme: 'sister',
      askName: true,
      nameDefault: '',
      enabled: true,
      closedText: '不是姐妹，这对吗？',
      copies: defaultCopies('sister'),
    },
    {
      key: 'baby',
      label: '好宝宝',
      tagline: '想我了就直说，别让我猜',
      emoji: '🥰',
      theme: 'baby',
      askName: false,
      nameDefault: '宝宝',
      enabled: true,
      closedText: '不好意思，查无此人',
      copies: defaultCopies('baby'),
    },
    {
      key: 'dadmam',
      label: 'DAD&MUM',
      tagline: '在家排第一，出门往后稍稍',
      emoji: '🏠',
      theme: 'dadmam',
      askName: false,
      nameDefault: '爸妈',
      enabled: true,
      closedText: '你想倒反天罡',
      copies: defaultCopies('dadmam'),
    },
  ],
  schedule: {
    active: '996',
    lockMode: 'covered',
    presets: [
      { key: '996', label: '996（周一至周六 09:00-21:00）', workdays: [1, 2, 3, 4, 5, 6], workStart: '09:00', workEnd: '21:00' },
      { key: '865', label: '865（周一至周五 08:00-18:00）', workdays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '18:00' },
      { key: 'custom', label: '自定义', workdays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '18:00' },
    ],
  },
  slots: [
    // 早上只放出来看看：牛马起不来
    { key: 'morning', label: '早上', start: '06:00', end: '11:00', selectable: false },
    { key: 'noon', label: '中午', start: '11:00', end: '17:00', selectable: true },
    { key: 'evening', label: '晚上', start: '17:00', end: '23:00', selectable: true },
  ],
  // 拉长到两个月，日历的「切月」才有意义
  dateRangeDays: 60,
  reopenAfterDays: 1,
  allowCustomTime: true,
  allowMultipleSlots: true,
  place: {
    allowLetYouDecide: true,
    decideLabel: '你定吧',
    teaseLabel: '真的不再想想？',
    teaseClicks: 2,
    decidedLabel: '由你定',
    placeholder: '比如：楼下那家火锅 / 江边公园',
  },
  copies: {
    morning: '{name}，实不相瞒，早上我是真起不来。真要约早上，得麻烦你前一晚把我聊通宵。',
    hotCopy: '中午太晒，牛马快成牛肉干了……',
    coldCopy: '晚上太冷，牛马快成冰鲜了……',
    locked: '这会儿牛马正在上班，门已经焊死了。',
    displayOnly: '这个时段纯属展览，牛马起不来，看看就好。',

    pending: '牛马正在加班加点地审……',
    pendingSub: '审完就骑马赶来。',
    accepted: '批了！',
    acceptedSub: '到时候见，别放我鸽子。',
    rejected: '真的对不住，这阵子实在抽不开身。等忙完这阵，我请你。',
    closedTitle: '审批不通过',
    siteClosed: '牛马最近连轴转，实在接不动了。等忙完这阵，门口挂个牌子等你。',
  },
  // 9 月这种「既不算夏也不算冬」的月份就不显示冷热
  season: {
    hotMonths: [6, 7, 8],
    coldMonths: [12, 1, 2],
  },
};

/**
 * 取某个身份最终生效的文案。
 *
 * 全局 `copies` 打底，身份的 `copies` 覆盖上去 ——
 * 这样后台只改一个身份也不会影响其他三个。
 */
export function copiesFor(config: AppConfig, roleKey: RoleKey | undefined): CopiesConfig {
  const overrides = config.roles.find((role) => role.key === roleKey)?.copies;
  return { ...config.copies, ...overrides };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function asHm(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^\d{1,2}:\d{2}$/.test(value) ? value : fallback;
}

function asWorkdays(value: unknown, fallback: number[]): number[] {
  // 和月份一个道理：只有「字段整个缺失」才退回默认。
  // **一天都不选就是一星期都不上班**（比如放假在家），这是合法配置，不能被偷偷改回去。
  if (!Array.isArray(value)) return fallback;
  const days = value.filter((day): day is number => typeof day === 'number' && day >= 1 && day <= 7);
  return [...new Set(days)].sort((a, b) => a - b);
}

function normalizeSchedule(raw: unknown): ScheduleConfig {
  const input = asRecord(raw);
  const presetsRaw = Array.isArray(input.presets) ? input.presets : [];
  const presets: WorkSchedule[] = DEFAULT_CONFIG.schedule.presets.map((fallback) => {
    const match = presetsRaw.map(asRecord).find((preset) => preset.key === fallback.key);
    if (match === undefined) return fallback;
    return {
      key: fallback.key,
      label: asString(match.label, fallback.label),
      workdays: asWorkdays(match.workdays, fallback.workdays),
      workStart: asHm(match.workStart, fallback.workStart),
      workEnd: asHm(match.workEnd, fallback.workEnd),
    };
  });

  const active = asString(input.active, DEFAULT_CONFIG.schedule.active);
  const lockMode: LockMode = input.lockMode === 'overlap' ? 'overlap' : 'covered';

  return { active: presets.some((p) => p.key === active) ? active : DEFAULT_CONFIG.schedule.active, presets, lockMode };
}

function normalizeSlots(raw: unknown): SlotDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_CONFIG.slots;
  return raw.map(asRecord).map((slot, index) => {
    const fallback = DEFAULT_CONFIG.slots[index] ?? DEFAULT_CONFIG.slots[0];
    if (fallback === undefined) {
      return { key: `slot${index}`, label: `时段${index + 1}`, start: '00:00', end: '01:00', selectable: true };
    }
    return {
      key: asString(slot.key, fallback.key),
      label: asString(slot.label, fallback.label),
      start: asHm(slot.start, fallback.start),
      end: asHm(slot.end, fallback.end),
      selectable: asBoolean(slot.selectable, fallback.selectable),
    };
  });
}

/** 身份文案：全局的打底，身份的覆盖上去。 */
function normalizeRoleCopies(raw: unknown, fallback: RoleCopies): RoleCopies {
  const input = asRecord(raw);
  const pick = (key: keyof RoleCopies): string => asString(input[key], fallback[key]);
  return {
    morning: pick('morning'),
    hotCopy: pick('hotCopy'),
    coldCopy: pick('coldCopy'),
    locked: pick('locked'),
    displayOnly: pick('displayOnly'),
    pending: pick('pending'),
    pendingSub: pick('pendingSub'),
    accepted: pick('accepted'),
    acceptedSub: pick('acceptedSub'),
    rejected: pick('rejected'),
    closedTitle: pick('closedTitle'),
  };
}

function normalizeRoles(raw: unknown): RoleConfig[] {
  const list = Array.isArray(raw) ? raw.map(asRecord) : [];
  return DEFAULT_CONFIG.roles.map((fallback) => {
    const match = list.find((role) => role.key === fallback.key);
    if (match === undefined) return { ...fallback };
    return {
      key: fallback.key as RoleKey,
      label: asString(match.label, fallback.label),
      tagline: asString(match.tagline, fallback.tagline),
      emoji: asString(match.emoji, fallback.emoji),
      // 认不出来就退回这个身份的默认主题，别让未知值把整页搞白
      theme: THEME_KEYS.includes(match.theme as ThemeKey) ? (match.theme as ThemeKey) : fallback.theme,
      askName: asBoolean(match.askName, fallback.askName),
      nameDefault: asString(match.nameDefault, fallback.nameDefault ?? ''),
      enabled: asBoolean(match.enabled, fallback.enabled),
      closedText: asString(match.closedText, fallback.closedText),
      copies: normalizeRoleCopies(match.copies, fallback.copies),
    };
  });
}

function normalizeSite(raw: unknown): SiteConfig {
  const input = asRecord(raw);
  return {
    title: asString(input.title, DEFAULT_CONFIG.site.title),
    subtitle: asString(input.subtitle, DEFAULT_CONFIG.site.subtitle),

    open: asBoolean(input.open, DEFAULT_CONFIG.site.open),
  };
}

function normalizePlace(raw: unknown): PlaceConfig {
  const input = asRecord(raw);
  return {
    allowLetYouDecide: asBoolean(input.allowLetYouDecide, DEFAULT_CONFIG.place.allowLetYouDecide),
    decideLabel: asString(input.decideLabel, DEFAULT_CONFIG.place.decideLabel),
    teaseLabel: asString(input.teaseLabel, DEFAULT_CONFIG.place.teaseLabel),
    teaseClicks: asNumber(input.teaseClicks, DEFAULT_CONFIG.place.teaseClicks, 1, 5),
    decidedLabel: asString(input.decidedLabel, DEFAULT_CONFIG.place.decidedLabel),
    placeholder: asString(input.placeholder, DEFAULT_CONFIG.place.placeholder),
  };
}

function asMonths(value: unknown, fallback: number[]): number[] {
  // 只有「字段整个缺失」才退回默认。
  // **空数组就是空数组** —— 月份全不选 = 那个时段永远不显示冷热，这是用户的选择，不能悄悄改回去。
  if (!Array.isArray(value)) return fallback;
  const months = value.filter(
    (month): month is number => typeof month === 'number' && Number.isInteger(month) && month >= 1 && month <= 12,
  );
  return [...new Set(months)].sort((a, b) => a - b);
}

function normalizeSeason(raw: unknown): SeasonConfig {
  const input = asRecord(raw);
  return {
    hotMonths: asMonths(input.hotMonths, DEFAULT_CONFIG.season.hotMonths),
    coldMonths: asMonths(input.coldMonths, DEFAULT_CONFIG.season.coldMonths),
  };
}

function normalizeCopies(raw: unknown): CopiesConfig {
  const input = asRecord(raw);
  return {
    morning: asString(input.morning, DEFAULT_CONFIG.copies.morning),
    hotCopy: asString(input.hotCopy, DEFAULT_CONFIG.copies.hotCopy),
    coldCopy: asString(input.coldCopy, DEFAULT_CONFIG.copies.coldCopy),
    locked: asString(input.locked, DEFAULT_CONFIG.copies.locked),
    displayOnly: asString(input.displayOnly, DEFAULT_CONFIG.copies.displayOnly),
    pending: asString(input.pending, DEFAULT_CONFIG.copies.pending),
    pendingSub: asString(input.pendingSub, DEFAULT_CONFIG.copies.pendingSub),
    accepted: asString(input.accepted, DEFAULT_CONFIG.copies.accepted),
    acceptedSub: asString(input.acceptedSub, DEFAULT_CONFIG.copies.acceptedSub),
    rejected: asString(input.rejected, DEFAULT_CONFIG.copies.rejected),
    closedTitle: asString(input.closedTitle, DEFAULT_CONFIG.copies.closedTitle),
    siteClosed: asString(input.siteClosed, DEFAULT_CONFIG.copies.siteClosed),
  };
}

/**
 * 把任意来源（磁盘上的 config.json、后台提交的 body）归一化成完整配置。
 * 缺字段补默认值，类型不对就用默认值——保证旧配置永远能升级上来。
 */
export function normalizeConfig(raw: unknown): AppConfig {
  const input = asRecord(raw);
  return {
    version: asNumber(input.version, DEFAULT_CONFIG.version, 1, 999),
    site: normalizeSite(input.site),
    roles: normalizeRoles(input.roles),
    schedule: normalizeSchedule(input.schedule),
    slots: normalizeSlots(input.slots),
    dateRangeDays: asNumber(input.dateRangeDays, DEFAULT_CONFIG.dateRangeDays, 1, 90),
    reopenAfterDays: asNumber(input.reopenAfterDays, DEFAULT_CONFIG.reopenAfterDays, 1, 30),
    allowCustomTime: asBoolean(input.allowCustomTime, DEFAULT_CONFIG.allowCustomTime),
    allowMultipleSlots: asBoolean(input.allowMultipleSlots, DEFAULT_CONFIG.allowMultipleSlots),
    place: normalizePlace(input.place),
    copies: normalizeCopies(input.copies),
    season: normalizeSeason(input.season),
  };
}

/** 按 key 找一个身份配置。 */
export function findRole(config: AppConfig, key: string): RoleConfig | undefined {
  return config.roles.find((role) => role.key === key);
}

/** 判断字符串是不是合法的身份 key。 */
export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}
