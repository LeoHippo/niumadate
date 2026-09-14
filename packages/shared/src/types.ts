/** 所有 JSON 接口的统一前缀。 */
export const API_PREFIX = '/api';

/** 身份标识。 */
export const ROLE_KEYS = ['brother', 'sister', 'baby', 'dadmam'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * 身份视觉主题。
 *
 * 每个身份从头到脚一套皮：背景、字体、边框方圆、配色、装饰。
 * 取值和 RoleKey 一一对应，看起来是重复，但**故意分开**——
 * 以后想让「好姐妹」用「好宝宝」的皮，或者一个身份多个皮，改这里就行。
 */
export const THEME_KEYS = ['brother', 'sister', 'baby', 'dadmam'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

/** 提交记录的处理状态。 */
export type SubmissionStatus = 'pending' | 'accepted' | 'cancelled';

/** 时段锁定的判定方式。 */
export type LockMode = 'covered' | 'overlap';

/** 一个身份页面。 */
export interface RoleConfig {
  key: RoleKey;
  /** 入口页卡片上的名字。 */
  label: string;
  /** 卡片上的一句话。 */
  tagline: string;
  /** 卡片上配的表情。 */
  emoji: string;
  /** 这个身份从头到脚用哪套皮。 */
  theme: ThemeKey;
  /**
   * 要不要问名号。
   *
   * 好兄弟/好姐妹可能有好几个，得问；好宝宝和父母就牛马一个，
   * 还让人自报家门很奇怪 —— 关掉即可，名字走 nameDefault。
   */
  askName: boolean;
  /** askName 为 false 时用的名字。留空就退回卡片上的 label。 */
  nameDefault: string;
  /** 是否开启。关闭后卡片仍在，点进去甩 closedText。 */
  enabled: boolean;
  /** 关闭时甩的话。 */
  closedText: string;
  /**
   * 这个身份的专属文案（覆盖全局的 copies）。
   *
   * 四个身份本来就该是**四种口气**：兄弟直来直去、姐妹温柔、
   * 宝宝撒娇、父母一本正经。站点关闭那条是全局的，不在这个范围内。
   */
  copies: RoleCopies;
}

/** 身份能覆盖的文案范围（站点关闭是全局的，不分身份）。 */
export type RoleCopies = Omit<CopiesConfig, 'siteClosed'>;

/** 一天里的一个时段。 */
export interface SlotDef {
  key: string;
  label: string;
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
  /** false = 只放出来看看，不可选（比如「早上」）。 */
  selectable: boolean;
}

/** 时段不可选的原因。 */
export type SlotBlockReason = 'work' | 'display';

/** 一套工作制。 */
export interface WorkSchedule {
  key: string;
  label: string;
  /** 1 = 周一 … 7 = 周日 */
  workdays: number[];
  /** HH:mm */
  workStart: string;
  /** HH:mm */
  workEnd: string;
}

export interface SiteConfig {
  title: string;
  subtitle: string;

  /**
   * 总开关。关掉之后好友端不再接单，只留一句「暂停营业」。
   * 已经交过单子的好友仍然能看到回执，不至于被晾在外面。
   */
  open: boolean;
}

export interface ScheduleConfig {
  /** 当前启用哪套工作制（对应 presets 里的 key）。 */
  active: string;
  presets: WorkSchedule[];
  lockMode: LockMode;
}

export interface PlaceConfig {
  /** 是否允许「让你定」这个玩法。 */
  allowLetYouDecide: boolean;
  /** 第一次看到的按钮文案。 */
  decideLabel: string;
  /** 躲闪后变成的文案。 */
  teaseLabel: string;
  /** 点几次才认输（默认 2）。 */
  teaseClicks: number;
  /** 认输后地点显示的文案。 */
  decidedLabel: string;
  placeholder: string;
}

export interface CopiesConfig {
  /** 以下均支持 {name} 占位符。 */
  morning: string;
  /** 中午太热时说的话。 */
  hotCopy: string;
  /** 晚上太冷时说的话。 */
  coldCopy: string;
  locked: string;
  /** 点了只放出来看看的时段（早上）时说的话。 */
  displayOnly: string;

  /** 待审批：主文案 */
  pending: string;
  /** 待审批：下面那句 */
  pendingSub: string;
  /** 已通过：主文案 */
  accepted: string;
  /** 已通过：下面那句 */
  acceptedSub: string;
  /** 已驳回：主文案 */
  rejected: string;
  /** 关停弹窗的标题。 */
  closedTitle: string;
  /** 站点暂停营业时的话。 */
  siteClosed: string;
}

/** 中午「太热 / 太冷」的月份判定。 */
export interface SeasonConfig {
  /** 归为「太热」的月份（1-12）。 */
  hotMonths: number[];
  /** 归为「太冷」的月份（1-12）。 */
  coldMonths: number[];
}

export interface AppConfig {
  version: number;
  site: SiteConfig;
  roles: RoleConfig[];
  schedule: ScheduleConfig;
  slots: SlotDef[];
  /** 从今天起可选多少天。 */
  dateRangeDays: number;
  /**
   * 约会日之后第几天可以重新填写。
   * 1 = 第二天就能重填（约会当天仍然锁定）。
   */
  reopenAfterDays: number;
  /** 允许好友自己加一条「你没想到的时间」。 */
  allowCustomTime: boolean;
  /** 允许一次勾选多个「日期 + 时段」。 */
  allowMultipleSlots: boolean;
  place: PlaceConfig;
  copies: CopiesConfig;
  season: SeasonConfig;
}

/** 好友勾选的一个「日期 + 时段」。 */
export interface SlotSelection {
  /** YYYY-MM-DD */
  date: string;
  /** 对应 SlotDef.key */
  slot: string;
}

/** 好友自己加的一条时间。 */
export interface CustomTime {
  /** YYYY-MM-DD */
  date: string;
  text: string;
}

export interface Submission {
  id: string;
  role: RoleKey;
  name: string;
  /** 浏览器生成的随机设备号，弱身份。 */
  deviceId: string;
  slots: SlotSelection[];
  customTimes: CustomTime[];
  /** null 表示「由你定」。 */
  place: string | null;
  message: string;
  status: SubmissionStatus;
  /** 后台的审批意见，好友永远能看到。 */
  adminNote: string;
  /** **好友**提的见面要求 / 建议，比如「带一朵鲜花」。 */
  meetingNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubmissionInput {
  role: RoleKey;
  name: string;
  deviceId: string;
  slots: SlotSelection[];
  customTimes: CustomTime[];
  place: string | null;
  message: string;
  /** 好友提的见面要求，可空。 */
  meetingNote: string;
}

/** 时段单元格：某个日期上的某个时段。 */
export interface SlotCell {
  /** YYYY-MM-DD */
  date: string;
  /** 1-7 */
  weekday: number;
  /** 对应 SlotDef.key */
  slot: string;
  /** 能不能选。 */
  selectable: boolean;
  /** null = 可选；work = 被工作冻住；display = 这个时段本身不开放。 */
  blockReason: SlotBlockReason | null;
  /**
   * 这个格子的冷热氛围。
   * **中午太热、晚上太冷**（夏天最热是中午，冬天最冷是晚上），其余时段为 null。
   */
  mood: 'hot' | 'cold' | null;
}

/** 日期网格的一行：一天。 */
export interface DayRow {
  /** YYYY-MM-DD */
  date: string;
  /** 1-7 */
  weekday: number;
  /** 「今天 · 6月1日 周一」这样的展示文案。 */
  label: string;
  cells: SlotCell[];
}

/** GET /api/health 的响应。 */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  /** 进程已运行秒数。 */
  uptime: number;
  /** ISO 8601 时间戳。 */
  timestamp: string;
}

/** 所有非 2xx 响应的统一结构。 */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

/** 统一错误响应构造器。 */
export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

/** 把 {name} 占位符替换成好友昵称。 */
export function withName(template: string, name: string): string {
  return template.replaceAll('{name}', name);
}
