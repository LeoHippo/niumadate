import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { activeSchedule, buildDayRows, buildDocNumber, isoWeekday, toDateKey } from '@niumadate/shared';
import { BigEmoji } from './big-emoji';
import type { AppConfig, RoleConfig, RoleKey, SlotCell, SlotDef } from '@niumadate/shared';
import { blockReasonText } from './lib';

/** 圆形公章。 */
export function Stamp({ text, tone = 'red' }: { text: string; tone?: 'red' | 'gray' }) {
  return <span className={`stamp stamp-${tone}`}>{text}</span>;
}

/**
 * 牛马本马。
 *
 * 没有现成的「牛马」emoji，所以手绘了一个：牛角 + 马耳 + 马鬃 + 牛斑，
 * 一眼能看出是「牛」和「马」凑出来的那只。
 * 用 SVG 画而不是找现成图：没有版权问题、缩放不糊、颜色能跟着主题走、
 * 也不用多一个网络请求。
 */
export function NiumaMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="牛马"
    >
      {/* 牛角：骨白、短弯、位置更高 */}
      <path
        d="M20 18 C14 13 13 8 17 4 C20 10 24 15 27 18 Z"
        fill="#f7edd8"
        stroke="#9c7f57"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M44 18 C50 13 51 8 47 4 C44 10 40 15 37 18 Z"
        fill="#f7edd8"
        stroke="#9c7f57"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* 马耳：圆角三角，长在两侧，比角矮 */}
      <path
        d="M18 28 C12 25 6 18 10 13 C16 11 23 19 27 25 Z"
        fill="#e8c9a3"
        stroke="#b99a6b"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M46 28 C52 25 58 18 54 13 C48 11 41 19 37 25 Z"
        fill="#e8c9a3"
        stroke="#b99a6b"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* 头 */}
      <rect x="13" y="18" width="38" height="37" rx="16" fill="#f9ead6" stroke="#c9a781" strokeWidth="2.5" />
      {/* 牛斑 */}
      <path d="M37 21 C47 18 54 26 50 36 C44 39 36 31 37 21 Z" fill="#8b5e3c" opacity="0.88" />
      {/* 马鬃：额前那一撮 */}
      <path d="M21 26 Q32 16 43 26 Q32 21.5 21 26 Z" fill="#4a3b2f" />
      {/* 眼睛 */}
      <circle cx="26" cy="35" r="3.6" fill="#3a2f26" />
      <circle cx="39" cy="35" r="3.6" fill="#3a2f26" />
      <circle cx="27.3" cy="33.7" r="1.25" fill="#fff" />
      <circle cx="40.3" cy="33.7" r="1.25" fill="#fff" />
      {/* 口鼻 */}
      <ellipse cx="32.5" cy="46" rx="11.5" ry="7.5" fill="#f3dcc6" />
      <circle cx="28.5" cy="46" r="1.9" fill="#b58d70" />
      <circle cx="36.5" cy="46" r="1.9" fill="#b58d70" />
      <path
        d="M29 50 Q32.5 52.5 36 50"
        fill="none"
        stroke="#b58d70"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type PuppetMood = 'hot' | 'cold' | 'cry' | 'happy';

const PUPPET_FACE: Record<PuppetMood, string> = {
  hot: '🥵',
  cold: '🥶',
  cry: '😭',
  happy: '🥳',
};

const PUPPET_BITS: Record<PuppetMood, [string, string]> = {
  hot: ['💧', '💦'],
  cold: ['❄️', '❄️'],
  cry: ['💧', '💧'],
  happy: ['🎉', '✨'],
};

/**
 * 表情小人。
 *
 * 脸用 Noto 动画 emoji（真·动图），外面再套一层 CSS 抖动 + 飞溅的小水滴/星星。
 * 素材放不出来时会自动退回静态 emoji，不会开天窗。
 */
export function Puppet({ mood }: { mood: PuppetMood }) {
  const [first, second] = PUPPET_BITS[mood];
  return (
    <span className={`puppet puppet-${mood}`} aria-hidden="true">
      <BigEmoji char={PUPPET_FACE[mood]} size={34} className="puppet-body" />
      <span className="puppet-bit">{first}</span>
      <span className="puppet-bit puppet-bit-2">{second}</span>
    </span>
  );
}

/** 点开被关闭的身份时甩出来的那一屏。 */
export function ClosedModal({
  role,
  title,
  onClose,
}: {
  role: RoleConfig;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-mask" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        data-theme={role.theme}
        onClick={(e) => e.stopPropagation()}
      >
        <Stamp text={title} />
        <p className="art-text">{role.closedText}</p>
        <Puppet mood="cold" />
        <button
          type="button"
          className="btn btn-ghost"
          title="关掉这一屏，回身份选择页"
          onClick={onClose}
        >
          我这就走
        </button>
      </div>
    </div>
  );
}

/** 通用的「一句话 + 一个按钮」弹窗。 */
export function NoteModal({
  stamp,
  text,
  mood,
  action,
  onClose,
}: {
  stamp: string;
  text: string;
  mood: 'hot' | 'cold';
  action: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-mask" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <Stamp text={stamp} />
        <p className="art-text">{text}</p>
        <Puppet mood={mood} />
        <button type="button" className="btn btn-primary" title="知道了，关掉" onClick={onClose}>
          {action}
        </button>
      </div>
    </div>
  );
}

/**
 * 站点暂停营业时，好友端看到的整屏。
 *
 * 做成「小店拉下卷帘门」的样子：门帘从上往下落，落定之后挂出「暂停营业」的牌子，
 * 招牌上的营业灯由绿转红。纯 CSS 动画，没有外部素材。
 */
export function SiteClosed({ config }: { config: AppConfig }) {
  return (
    <main className="paper">
      <header className="redhead">
        <p className="doc-number">{buildDocNumber()}</p>
        <h1 className="redhead-title">{config.site.title}</h1>
        <p className="redhead-sub">{config.site.subtitle}</p>
      </header>
      <div className="rule" />

      <div className="shop">
        <div className="shop-frame">
          <div className="shop-board">
            <span className="shop-lamp" aria-hidden="true" />
            <NiumaMark size={28} />
            <span className="shop-name">牛马小铺</span>
          </div>

          <div className="shop-door">
            <div className="shop-shutter">
              <span className="shop-sign">
                <span className="shop-sign-inner">暂停营业</span>
              </span>
            </div>
          </div>

          <div className="shop-floor" />
        </div>
      </div>

      <p className="shop-copy">{config.copies.siteClosed}</p>

      <div className="receipt-hint">
        <p>着急的话，</p>
        <p className="receipt-hint-key">请直接微信联系牛马</p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ 日历 */

interface CalendarProps {
  config: AppConfig;
  /** 当前选中的日期 YYYY-MM-DD。 */
  selected: string;
  /** 已经选过时段的日期，会打个小点。 */
  marked: Set<string>;
  onPick: (date: string) => void;
}

const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];

/** 月历。只能点选可选范围内的日子，左右切月。 */
export function Calendar({ config, selected, marked, onPick }: CalendarProps) {
  const rows = useMemo(() => buildDayRows(config), [config]);
  const allowed = useMemo(() => new Map(rows.map((row) => [row.date, row])), [rows]);
  const schedule = activeSchedule(config);

  const minMonth = (rows[0]?.date ?? toDateKey(new Date())).slice(0, 7);
  const maxMonth = (rows[rows.length - 1]?.date ?? minMonth).slice(0, 7);

  const [view, setView] = useState(() => (selected === '' ? minMonth : selected.slice(0, 7)));

  // 从别处回来时，日历跟到选中的那个月
  useEffect(() => {
    if (selected !== '') setView(selected.slice(0, 7));
  }, [selected]);

  // 可选范围内的所有月份，给下拉栏用
  const months = useMemo(() => {
    const list: Array<{ value: string; year: number; month: number }> = [];
    const [minYear, minMon] = minMonth.split('-').map(Number);
    const [maxYear, maxMon] = maxMonth.split('-').map(Number);
    let cursorYear = minYear ?? 0;
    let cursorMonth = minMon ?? 1;

    while (cursorYear < (maxYear ?? 0) || (cursorYear === maxYear && cursorMonth <= (maxMon ?? 12))) {
      list.push({
        value: `${cursorYear}-${String(cursorMonth).padStart(2, '0')}`,
        year: cursorYear,
        month: cursorMonth,
      });
      cursorMonth += 1;
      if (cursorMonth > 12) {
        cursorMonth = 1;
        cursorYear += 1;
      }
    }
    return list;
  }, [minMonth, maxMonth]);

  const [yearPart, monthPart] = view.split('-');
  const year = Number(yearPart ?? 0);
  const month = Number(monthPart ?? 1);

  const years = useMemo(() => [...new Set(months.map((item) => item.year))], [months]);
  const monthChoices = months.filter((item) => item.year === year);

  /** 换年之后，如果原来那个月在新的一年里不存在，就落到最近的月份。 */
  function pickYear(nextYear: number): void {
    const candidates = months.filter((item) => item.year === nextYear);
    if (candidates.length === 0) return;
    const sameMonth = candidates.find((item) => item.month === month);
    const fallback =
      sameMonth ?? (nextYear < year ? candidates[candidates.length - 1] : candidates[0]);
    if (fallback !== undefined) setView(fallback.value);
  }

  const offset = isoWeekday(new Date(year, month - 1, 1)) - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = toDateKey(new Date());

  function shiftMonth(delta: number): void {
    const next = new Date(year, month - 1 + delta, 1);
    setView(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${view}-${String(index + 1).padStart(2, '0')}`),
  ];

  return (
    <div className="calendar">
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          disabled={view <= minMonth}
          title="上个月"
          aria-label="上个月"
          onClick={() => shiftMonth(-1)}
        >
          ‹
        </button>
        <div className="cal-pickers">
          <select
            className="cal-select"
            aria-label="年份"
            value={year}
            onChange={(event) => pickYear(Number(event.target.value))}
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item} 年
              </option>
            ))}
          </select>
          <select
            className="cal-select"
            aria-label="月份"
            value={month}
            onChange={(event) =>
              setView(`${year}-${String(Number(event.target.value)).padStart(2, '0')}`)
            }
          >
            {monthChoices.map((item) => (
              <option key={item.value} value={item.month}>
                {item.month} 月
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="cal-nav"
          disabled={view >= maxMonth}
          title="下个月"
          aria-label="下个月"
          onClick={() => shiftMonth(1)}
        >
          ›
        </button>
      </div>

      <div className="cal-dow">
        {WEEK_HEADS.map((head) => (
          <span key={head}>{head}</span>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((key, index) => {
          if (key === null) return <span key={`blank-${index}`} className="cal-blank" />;

          const row = allowed.get(key);
          const available = row !== undefined;
          // 休息日（不在工作制的上班日里）
          const isRest = row !== undefined && !schedule.workdays.includes(row.weekday);
          // 这天所有时段都约不上（全被工作冻住）
          const soldOut = row !== undefined && row.cells.every((cell) => !cell.selectable);

          const className = [
            'cal-day',
            available ? '' : 'cal-day-off',
            // 底色只表达一件事：**这天有没有空**。
            // 休息日 / 今天 / 已选过都用小标记表达，不跟底色抢。
            available && !soldOut ? 'cal-day-open' : '',
            available && isRest ? 'cal-day-rest' : '',
            soldOut ? 'cal-day-full' : '',
            key === todayKey ? 'cal-day-today' : '',
            key === selected ? 'cal-day-on' : '',
          ]
            .filter((part) => part !== '')
            .join(' ');

          const picked = marked.has(key);
          const title = !available
            ? '不在可选范围内'
            : soldOut
              ? '这天牛马全天在岗，一个时段都腾不出来'
            : picked
              ? '这天你已经选过时段了'
              : isRest
                ? '休息日'
                : '工作日';

          return (
            <button
              key={key}
              type="button"
              className={className}
              disabled={!available}
              title={title}
              // 一格一格往下落，形成一道波。延迟按格子顺序递增。
              // 11ms 太密看不出是「波」，18ms 才数得出来；封顶 30 格（约 0.54s），
              // 不然最后几天要等一秒多才出现，显得拖。
              style={{ animationDelay: `${Math.min(index, 30) * 18}ms` }}
              onClick={() => onPick(key)}
            >
              <span className="cal-num">{Number(key.slice(8))}</span>
              {soldOut && <span className="cal-lock">🔒</span>}
              {picked && <span className="cal-mark">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span>
          <i className="legend-dot legend-open" />
          能约
        </span>
        <span>
          <i className="legend-dot legend-full" />
          约不上
        </span>
        <span>
          <i className="legend-dot legend-picked">✓</i>
          你已经选过
        </span>
        <span>
          <i className="legend-num">8</i>
          休息日
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 地点 / 躲闪 */

/**
 * 躲的窗口：这段时间内每点一下就挪一步，过后**自己滑回原位**。
 *
 * 一开始是 3 秒，短到「它刚躲完就回去了」，看不出这个往返。
 * 放到 5 秒，躲避、停顿、归位三段都看得清。
 */
const DODGE_WINDOW_MS = 5000;
const DODGE_MARGIN = 12;
/** 每步挪多远。小步慢走，比一次飞出去好玩，也不会跑丢。 */
const STEP_MIN = 96;
const STEP_MAX = 180;
/** 开了「减少动态效果」时改用的步子：还是躲，但幅度小一半。 */
const GENTLE_STEP_MIN = 40;
const GENTLE_STEP_MAX = 76;

/**
 * 躲避的活动范围：以**它自己原来的位置**为中心的一个框。
 *
 * 一开始只按视口夹取，结果按钮能飘到页面任意角落 ——
 * 盖住题目、压住分隔线、跑到「上一步」旁边，看起来像从界面里掉出来了。
 * 现在最多横跑 150px、纵跑 110px，就在输入框附近打转，跑不丢。
 */
const RANGE_X = 150;
const RANGE_Y = 110;

/**
 * 手机浏览器底部工具栏会盖住视口下沿一截，
 * 底部多留点余量，免得按钮躲到工具栏后面点不着。
 */
function bottomGuard(): number {
  return window.innerWidth < 620 ? 88 : DODGE_MARGIN;
}

interface Offset {
  x: number;
  y: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * 算出「再挪一小步」之后的位移。
 *
 * 位移始终被夹在「按钮仍完整留在视口内」的范围内，
 * 所以怎么点都不会跑出屏幕。
 */
function stepOffset(element: HTMLElement, current: Offset, gentle = false): Offset {
  const rect = element.getBoundingClientRect();

  // rect 里已经包含了当前位移，减掉才是「没位移时」的基准位置
  const baseLeft = rect.left - current.x;
  const baseTop = rect.top - current.y;
  const baseRight = rect.right - current.x;
  const baseBottom = rect.bottom - current.y;

  // 两条约束同时成立：① 别跑出自己附近那个框；② 别跑出屏幕。
  // 屏幕特别小时可能夹出「下限比上限还大」，那就退回原地不动，不要乱夹。
  const minX = Math.max(-RANGE_X, -baseLeft + DODGE_MARGIN);
  const maxX = Math.min(RANGE_X, window.innerWidth - baseRight - DODGE_MARGIN);
  const minY = Math.max(-RANGE_Y, -baseTop + DODGE_MARGIN);
  const maxY = Math.min(RANGE_Y, window.innerHeight - baseBottom - bottomGuard());

  const angle = Math.random() * Math.PI * 2;
  const low = gentle ? GENTLE_STEP_MIN : STEP_MIN;
  const high = gentle ? GENTLE_STEP_MAX : STEP_MAX;
  const distance = low + Math.random() * (high - low);

  const safe = (low: number, high: number, value: number): number =>
    low > high ? 0 : clamp(value, low, high);

  return {
    x: safe(minX, maxX, current.x + Math.cos(angle) * distance),
    y: safe(minY, maxY, current.y + Math.sin(angle) * distance),
  };
}

interface PlaceFieldProps {
  config: AppConfig;
  value: string;
  decided: boolean;
  onChange: (value: string) => void;
  onDecide: () => void;
  onUndecide: () => void;
}

/** 地点输入 + 会躲的「让你定」按钮。 */
export function PlaceField({ config, value, decided, onChange, onDecide, onUndecide }: PlaceFieldProps) {
  const [clicks, setClicks] = useState(0);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const offsetRef = useRef<Offset>({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** 这一段躲避的截止时间。中途点击只挪步，不重新计时。 */
  const dodgeUntilRef = useRef(0);
  /** 每 +1 就挪一步。 */
  const [dodgeTick, setDodgeTick] = useState(0);
  /** 只在「进入躲避阶段」时 +1，用来安排一次性归位。 */
  const [phaseId, setPhaseId] = useState(0);

  const reduceMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const applyOffset = useCallback((next: Offset) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  /**
   * 放在 layout effect 里挪，而不是点击处理函数里。
   *
   * 第一次点击会把按钮文案换成更长的那句，按钮因此换行、位置完全变了；
   * 在事件里同步测量拿到的是换行前的旧矩形，照它算边界就会把按钮送出屏幕。
   * layout effect 跑在布局稳定之后，量到的才是真位置。
   */
  useLayoutEffect(() => {
    if (dodgeTick === 0) return;
    const element = buttonRef.current;
    if (element === null) return;

    // 注意：**开了「减少动态效果」也照样躲**。
    // 躲是这个按钮的全部意义，不动就等于这个功能没了；
    // 只是把步子迈小一半，过渡交给 CSS 压短（见 styles.css 里的 .btn-dodge）。
    applyOffset(stepOffset(element, offsetRef.current, reduceMotion));
  }, [dodgeTick, applyOffset, reduceMotion]);

  /**
   * 整段躲避**最多** DODGE_WINDOW_MS，到点自己挪回原位。
   *
   * 注意这里依赖的是 phaseId 而不是 dodgeTick：如果每点一下就重新计时，
   * 那「追着点」就等于永远躲下去，人根本点不到它。
   */
  useEffect(() => {
    if (phaseId === 0) return;

    const timer = window.setTimeout(() => {
      dodgeUntilRef.current = 0;
      applyOffset({ x: 0, y: 0 });
    }, DODGE_WINDOW_MS);

    return () => window.clearTimeout(timer);
  }, [phaseId, applyOffset]);

  function handleDodge(): void {
    const now = Date.now();

    // 还在这一段躲避里：只再挪一步，**不延长窗口**
    if (now < dodgeUntilRef.current) {
      setDodgeTick((tick) => tick + 1);
      return;
    }

    const next = clicks + 1;
    setClicks(next);

    if (next >= config.place.teaseClicks) {
      dodgeUntilRef.current = 0;
      applyOffset({ x: 0, y: 0 });
      onDecide();
      return;
    }

    dodgeUntilRef.current = now + DODGE_WINDOW_MS;
    setPhaseId((id) => id + 1);
    setDodgeTick((tick) => tick + 1);
  }

  if (decided) {
    return (
      <div className="place-decided">
        <Stamp text={config.place.decidedLabel} tone="gray" />
        <span className="place-decided-text">地点交给牛马安排，你只管来</span>
        <button
          type="button"
          className="btn btn-link"
          title="改回自己填地点"
          onClick={onUndecide}
        >
          还是我自己定
        </button>
      </div>
    );
  }

  const label = clicks === 0 ? config.place.decideLabel : config.place.teaseLabel;

  return (
    <div className="place-field">
      <input
        className="input input-lg"
        value={value}
        maxLength={200}
        placeholder={config.place.placeholder}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {config.place.allowLetYouDecide && (
        <button
          type="button"
          ref={buttonRef}
          className="btn btn-dodge"
          title="真的要点吗？"
          style={{ transform: `translate(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px)` }}
          onClick={handleDodge}
        >
          {label}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 其它 */

/** 不可选时段的悬浮提示。 */
export function LockTip({
  config,
  cell,
  slot,
  roleKey,
  anchor,
}: {
  config: AppConfig;
  cell: SlotCell;
  slot: SlotDef;
  roleKey: RoleKey | undefined;
  anchor: HTMLElement;
}) {
  const rect = anchor.getBoundingClientRect();
  const style = {
    left: Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130),
    top: rect.top - 8,
  };

  return (
    <div className="lock-tip" style={style} role="tooltip">
      <strong>{cell.blockReason === 'display' ? '仅供观赏' : '冻住了'}</strong>
      <span>{blockReasonText(config, cell, slot, roleKey)}</span>
    </div>
  );
}

/** 向导进度：第 X 步 / 共 N 步。 */
/**
 * 进度指示。
 *
 * **同一个进度，四个身份四种读法** —— 这是「逻辑不同」而不是「长相不同」的地方：
 *   好兄弟   「第 3 步」       —— 数字，别绕弯子
 *   好姐妹   小圆点            —— 好看、不压迫
 *   好宝宝   小爱心            —— 走过的每一格都是心跳
 *   DAD&MUM  「第 3 / 6 项」   —— 像一份表单的条目编号
 *
 * 具体画成什么由 CSS 按 data-theme 决定，这里只把两种信息都给出去：
 * 序号文字 + 一排小标记。
 */
export function WizardProgress({ index, total }: { index: number; total: number }) {
  /** 「步」还是「项」—— 家人那边说的是流程，不是散步。 */
  const unit = document.documentElement.dataset.theme === 'dadmam' ? '项' : '步';

  return (
    <div className="wizard-progress">
      <div className="wizard-dots">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i <= index ? 'dot dot-on' : 'dot'} />
        ))}
      </div>
      <span className="wizard-count">
        第 {index + 1} / {total} {unit}
      </span>
    </div>
  );
}
