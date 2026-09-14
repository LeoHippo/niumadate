import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  THEME_KEYS,
  VOICE_KEYS,
  VOICE_LABELS,
  VOICE_PRESETS,
  addDaysKey,
  buildDocNumber,
  copiesFor,
  normalizeConfig,
} from '@niumadate/shared';
import type {
  AppConfig,
  RoleConfig,
  RoleCopies,
  RoleKey,
  Submission,
  SubmissionStatus,
  ThemeKey,
  VoiceKey,
  WorkSchedule,
} from '@niumadate/shared';
import { api, adminToken, describeError } from '../api';
import { NiumaMark } from '../components';
import { shortDate, STATUS_LABELS } from '../lib';

const WEEKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
];

function errText(cause: unknown): string {
  return describeError(cause);
}

/** 半小时一档，给所有「时间」输入框当候选：既能直接敲，也能从下拉里挑。 */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, '0');
  return `${hour}:${index % 2 === 0 ? '00' : '30'}`;
});



/** 2026-09-14T23:41:00.000Z -> 9月14日 23:41（本地时区）。 */
function shortStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
}

/** 四套皮各自长什么样，给后台选择时看的一句话说明。 */
const THEME_LABELS: Record<ThemeKey, string> = {
  brother: '好兄弟 · 直来直去（红头文件、方框、正红）',
  sister: '好姐妹 · 精致温柔（粉底、大圆角、玫瑰色、胶囊按钮）',
  baby: '好宝宝 · 甜甜软软（粉红渐变、圆滚滚、虚线框、爱心）',
  dadmam: 'DAD&MUM · 正式公文（灰底、双线方框、全直角、藏蓝）',
};

/** 每个身份的文案口气，折叠标题上给一句提示。 */
const COPY_VOICE: Record<RoleKey, string> = {
  brother: '直来直去，像半夜发微信',
  sister: '温柔，带点语气词',
  baby: '软一点，但别腻（可爱不等于叠字多）',
  dadmam: '一本正经的公文口吻',
};

/** 身份能覆盖的文案字段（站点关闭是全局的，不在这里）。 */
const ROLE_COPY_FIELDS: Array<[keyof RoleCopies, string]> = [
  ['morning', '早上弹窗（{name} 会替换成名字）'],
  ['hotCopy', '中午太热时说的话'],
  ['coldCopy', '晚上太冷时说的话'],
  ['locked', '点冻住的时段'],
  ['displayOnly', '点「仅供观赏」的时段'],
  ['pending', '待审批：主文案'],
  ['pendingSub', '待审批：下面那句'],
  ['accepted', '已通过：主文案'],
  ['acceptedSub', '已通过：下面那句'],
  ['rejected', '已驳回：主文案'],
  ['closedTitle', '身份关闭时的大标题（页面最上面那条）'],
];

/** 审批意见的快捷短语：省得每次都从头打字，点了会替换输入框内容。 */
const QUICK_NOTES = ['好的，就这么定', '那天实在走不开', '收到，我看看', '换个时间吧', '记得带伞'];

/** "6,7,8" -> [6,7,8]，顺手过滤掉不合法月份。 */
function parseMonths(text: string): number[] {
  return [
    ...new Set(
      text
        .split(/[,，、\s]+/)
        .map((part) => Number.parseInt(part, 10))
        .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
    ),
  ].sort((a, b) => a - b);
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => adminToken.get());
  const [tab, setTab] = useState<'list' | 'config' | 'report'>('list');
  const [pendingCount, setPendingCount] = useState(0);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);

  /**
   * 标签页标题上挂待审批数量。
   *
   * 牛马不用一直回来刷后台，瞥一眼标签页就知道有几单等着 ——
   * 这是这个应用里最省事的「通知」。
   */
  useEffect(() => {
    document.title = pendingCount > 0 ? `(${pendingCount}) 牛马后台` : '牛马后台';
    return () => {
      document.title = '非工作时间约会审批系统';
    };
  }, [pendingCount]);

  useEffect(() => {
    if (!settingsDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [settingsDirty]);

  useEffect(() => {
    if (token === null) return;
    void (async () => {
      try {
        setConfig(await api.getConfig());
      } catch {
        // 拿不到配置也不影响审批，只是时段显示成 key
      }
    })();
  }, [token]);

  async function toggleSite(open: boolean): Promise<void> {
    setSiteBusy(true);
    setSiteError(null);
    try {
      setConfig(await api.admin.setSiteOpen(open));
    } catch (cause) {
      setSiteError(errText(cause));
    } finally {
      setSiteBusy(false);
    }
  }

  if (token === null) {
    return (
      <main className="paper admin">
        <header className="redhead">
          <h1 className="redhead-title">牛马后台 · 登录</h1>
        </header>
        <div className="rule" />
        <LoginView
          onDone={(value) => {
            adminToken.set(value);
            setToken(value);
          }}
        />
      </main>
    );
  }

  return (
    <main className="paper admin">
      <header className="redhead">
        <NiumaMark size={44} className="head-mark" />
        <h1 className="redhead-title">牛马后台</h1>
        <p className="redhead-sub">审批约会申请 · 调整系统配置</p>
      </header>
      <div className="rule" />

      {config !== null && (
        <SiteStatusBar
          open={config.site.open}
          busy={siteBusy}
          error={siteError}
          onToggle={() => void toggleSite(!config.site.open)}
        />
      )}

      <div className="admin-bar">
        <div className="tabs">
          <button
            type="button"
            className={tab === 'list' ? 'tab tab-on' : 'tab'}
            title="看所有申请。审批中的、今天交上来的排在最前面"
            onClick={() => setTab('list')}
          >
            审批列表
            {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
          </button>
          <button
            type="button"
            className={tab === 'config' ? 'tab tab-on' : 'tab'}
            title="站名、身份、工作制、时段、冷热月份、文案……都在这里改"
            onClick={() => setTab('config')}
          >
            系统配置
          </button>
          <button
            type="button"
            className={tab === 'report' ? 'tab tab-on' : 'tab'}
            title="翻旧账：收了多少单、通过率、被约最多的时段、熬到几点"
            onClick={() => setTab('report')}
          >
            牛马年报
          </button>
        </div>
        <div className="admin-bar-right">
          <Link className="btn btn-link" to="/" title="看看好友那边长什么样">
            去用户端
          </Link>
          <button
            type="button"
            className="btn btn-link"
            title="清掉本机存的登录凭证"
            onClick={() => {
              adminToken.set(null);
              setToken(null);
            }}
          >
            退出登录
          </button>
        </div>
      </div>

      {/*
        三个面板都挂着，用 CSS 藏起没在看的那个。
        这样做有两个好处：列表一直在算待审批数量（标签页角标才不会掉），
        配置页也不会因为切走就把没保存的改动丢了。
      */}
      <div className={tab === 'list' ? undefined : 'tab-panel-off'}>
        <SubmissionsPanel config={config} onPendingChange={setPendingCount} />
      </div>
      <div className={tab === 'config' ? undefined : 'tab-panel-off'}>
        <SettingsPanel siteOpen={config?.site.open ?? true} onDirtyChange={setSettingsDirty} />
      </div>
      {/* 年报不需要常驻，点开才挂载 */}
      {tab === 'report' && <YearReport config={config} />}
    </main>
  );
}

/**
 * 后台最上面那条总开关。
 *
 * 这是「一键关店」的东西，必须一眼看得见、一下点得到 ——
 * 之前它只是配置页最下面的一个小勾选框，完全不成比例。
 */
function SiteStatusBar({
  open,
  busy,
  error,
  onToggle,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onToggle: () => void;
}) {
  return (
    <section className={open ? 'site-bar site-bar-open' : 'site-bar site-bar-closed'}>
      <div className="site-bar-main">
        <span className="site-bar-dot" aria-hidden="true" />
        <div className="site-bar-text">
          <p className="site-bar-title">{open ? '接单中' : '暂停营业'}</p>
          <p className="site-bar-desc">
            {open
              ? '好友现在可以正常提交约会申请。'
              : '好友端只显示「暂停营业」；已交过单的人仍能看回执和驳回原因。'}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="btn site-bar-btn"
        title={
          open
            ? '关掉之后好友端只看到卷帘门；已交过单的人仍能看回执和驳回原因'
            : '重新开始收单，好友端立刻恢复'
        }
        disabled={busy}
        onClick={onToggle}
      >
        {busy ? '处理中…' : open ? '暂停接单' : '恢复接单'}
      </button>

      {error !== null && <p className="error-box">{error}</p>}
    </section>
  );
}

function LoginView({ onDone }: { onDone: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await api.admin.login(password);
      onDone(result.token);
    } catch (cause) {
      setError(errText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="block">
      <h2 className="block-title">请输入后台口令</h2>
      <p className="block-hint">
        本地开发默认口令是 <code>niuma-dev</code>，线上请用 ADMIN_PASSWORD 环境变量覆盖。
      </p>
      <div className="custom-row">
        <input
          className="input"
          type="password"
          value={password}
          placeholder="口令"
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void go();
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          title="口令对了才进得来"
          disabled={busy}
          onClick={() => void go()}
        >
          进入
        </button>
      </div>
      {error !== null && <p className="error-box">{error}</p>}
    </section>
  );
}

/** 「9月14日 晚上、9月15日 凌晨三点 · 看日出」这样的一句话。 */
function timeSummary(submission: Submission, config: AppConfig | null): string {
  const parts = [
    ...submission.slots.map((slot) => {
      const label = config?.slots.find((item) => item.key === slot.slot)?.label ?? slot.slot;
      return `${shortDate(slot.date)} ${label}`;
    }),
    ...submission.customTimes.map((item) => `${shortDate(item.date)} ${item.text}`),
  ];
  return parts.length === 0 ? '（没选）' : parts.join('、');
}

function roleLabelOf(submission: Submission, config: AppConfig | null): string {
  return config?.roles.find((role) => role.key === submission.role)?.label ?? submission.role;
}

function SubmissionsPanel({
  config,
  onPendingChange,
}: {
  config: AppConfig | null;
  onPendingChange: (count: number) => void;
}) {
  const [items, setItems] = useState<Submission[]>([]);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  /** '' = 全部日期，'today' = 今天，其余是「未来 N 天」。 */
  const [dateFilter, setDateFilter] = useState('');
  /** created = 按提交时间（默认）；meet = 按约会日期。 */
  const [sortBy, setSortBy] = useState<'created' | 'meet'>('created');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** 手动刷新：图标转一下，让人知道点到了。 */
  async function refreshByHand(): Promise<void> {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  function togglePick(id: string): void {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 待审批数量报给外层，挂在标签页角标上
  useEffect(() => {
    onPendingChange(items.filter((item) => item.status === 'pending').length);
  }, [items, onPendingChange]);

  /**
   * 行内直接改状态。
   * 以前必须展开详情、或者勾选再走批量栏 —— 处理一单要多两下，
   * 一次来十几单就很难受。
   */
  async function patchOne(id: string, status: SubmissionStatus): Promise<void> {
    try {
      await api.admin.patch(id, { status });
      if (selected?.id === id) setSelected(null);
      await reload();
    } catch (cause) {
      setError(errText(cause));
    }
  }

  /** 今天的 YYYY-MM-DD（本地时区）。 */
  const todayKey = new Date().toLocaleDateString('sv-SE');

  /** 这条是不是今天交上来的。 */
  function isToday(item: Submission): boolean {
    return item.createdAt.slice(0, 10) === todayKey;
  }

  /**
   * 这条记录里所有能被搜到的字。
   *
   * **时间也算进去** —— 好友提的「9月14日 晚上」整句都在 timeSummary 里，
   * 所以搜「9月14」「晚上」「凌晨三点」「江边」都能命中。
   */
  function searchText(item: Submission): string {
    return [
      item.name,
      roleLabelOf(item, config),
      STATUS_LABELS[item.status],
      timeSummary(item, config),
      item.place ?? '【由你定】',
      item.meetingNote,
      item.message,
      item.adminNote,
    ]
      .join(' ')
      .toLowerCase();
  }

  // 搜索放在客户端：反正是一次全量拉回来的，敲一个字就能立刻筛，不用来回打接口
  const needle = keyword.trim().toLowerCase();

  /**
   * 排序：**「审批中 + 今天」最靠前**，然后审批中，然后今天，最后按提交时间倒序。
   * 打开后台第一眼就该看到「今天刚交上来、还没处理」的那几条。
   */
  function sortRank(item: Submission): number {
    const pending = item.status === 'pending';
    const today = isToday(item);
    if (pending && today) return 0;
    if (pending) return 1;
    if (today) return 2;
    return 3;
  }

  /** 这条申请所有的约会日（含自定义时间）。 */
  function meetDates(item: Submission): string[] {
    return [...item.slots.map((slot) => slot.date), ...item.customTimes.map((time) => time.date)];
  }

  /** 最早的约会日，用来排序。 */
  function earliestMeetDate(item: Submission): string {
    const dates = meetDates(item).sort();
    return dates[0] ?? '';
  }

  /** 日期窗口的右端（含）。 */
  const horizon = dateFilter === '' || dateFilter === 'today' ? todayKey : addDaysKey(todayKey, Number(dateFilter));

  /**
   * 日期筛选：**只要有一个约会日落在窗口里就算命中**。
   * 一条申请可能同时约了好几天，用「最早那天」判会漏掉后面那几天。
   */
  function inDateWindow(item: Submission): boolean {
    if (dateFilter === '') return true;
    return meetDates(item).some((date) => date >= todayKey && date <= horizon);
  }

  const visible = (needle === '' ? items : items.filter((item) => searchText(item).includes(needle)))
    .filter(inDateWindow)
    .slice()
    .sort((a, b) => {
      if (sortBy === 'meet') {
        // 按约会日期：**最近要赴的那场排最前**，已经过去的沉到最后
        const dateA = earliestMeetDate(a);
        const dateB = earliestMeetDate(b);
        const pastA = dateA !== '' && dateA < todayKey ? 1 : 0;
        const pastB = dateB !== '' && dateB < todayKey ? 1 : 0;
        if (pastA !== pastB) return pastA - pastB;
        if (dateA !== dateB) return dateA < dateB ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      }
      return sortRank(a) - sortRank(b) || b.createdAt.localeCompare(a.createdAt);
    });

  const allPicked = visible.length > 0 && visible.every((item) => picked.has(item.id));

  function toggleAll(): void {
    if (allPicked) {
      setPicked((current) => {
        const next = new Set(current);
        for (const item of visible) next.delete(item.id);
        return next;
      });
      return;
    }
    setPicked((current) => {
      const next = new Set(current);
      for (const item of visible) next.add(item.id);
      return next;
    });
  }

  async function runBatch(action: 'accepted' | 'cancelled' | 'delete'): Promise<void> {
    const ids = [...picked];
    if (ids.length === 0) return;
    if (action === 'delete' && !window.confirm(`删掉这 ${ids.length} 条？好友那边也看不到了。`)) {
      return;
    }

    try {
      const result = await api.admin.batch(ids, action);
      const verb = action === 'delete' ? '删除' : action === 'accepted' ? '批准' : '驳回';
      setNotice(`已${verb} ${result.affected} 条`);
      setPicked(new Set());
      setSelected(null);
      await reload();
    } catch (cause) {
      setError(errText(cause));
    }
  }

  const reload = useCallback(async () => {
    try {
      const result = await api.admin.list({ role, status });
      setItems(result.items);
      setError(null);
    } catch (cause) {
      setError(errText(cause));
    }
  }, [role, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function download(content: string, type: string, extension: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `niumadate-${new Date().toISOString().slice(0, 10)}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 导出的**是当前筛出来的那些**，不是全量。
   * 以前搜出 18 条、导出的却是全部 55 条，太反直觉了。
   */
  function exportAll(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      filtered: needle !== '' || role !== '' || status !== '',
      count: visible.length,
      items: visible,
    };
    download(JSON.stringify(payload, null, 2), 'application/json', 'json');
  }

  /** 导出成表格，方便用 Excel / 飞书表格看。同样只导当前筛出来的。 */
  function exportCsv(): void {
    {
      const header = ['提交时间', '身份', '昵称', '时间', '地点', '见面要求', '留言', '状态', '审批意见'];

      const rows = visible.map((item) => [
        item.createdAt.slice(0, 19).replace('T', ' '),
        roleLabelOf(item, config),
        item.name,
        timeSummary(item, config),
        item.place === null ? '【由你定】' : item.place,
        item.meetingNote,
        item.message,
        STATUS_LABELS[item.status],
        item.adminNote,
      ]);

      // 值里可能有逗号和引号，统一加引号并转义
      const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
      const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');

      // 开头的 BOM 不能省：不然 Excel 打开中文是乱码
      download(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'csv');
    }
  }

  return (
    <section className="block">
      <div className="admin-bar">
        <div className="custom-row">
          <select
            className="input"
            value={role}
            title="按身份筛"
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">全部身份</option>
            {/* 从配置里读，别写死 —— 身份名字后台随时能改（比如 DAD&MAM → DAD&MUM） */}
            {(config?.roles ?? []).map((role) => (
              <option key={role.key} value={role.key}>
                {role.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={status}
            title="按审批状态筛"
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="pending">待审批</option>
            <option value="accepted">已批准</option>
            <option value="cancelled">已驳回</option>
          </select>
          <select
            className="input"
            value={dateFilter}
            title="只看这几天要赴的约（一条申请里任意一天命中就算）"
            onChange={(event) => setDateFilter(event.target.value)}
          >
            <option value="">全部日期</option>
            <option value="today">今天要赴的</option>
            <option value="7">未来 7 天</option>
            <option value="30">未来 30 天</option>
          </select>
          <select
            className="input"
            value={sortBy}
            title="按约会日期排 = 最近要赴的排最前，过去的沉底"
            onChange={(event) => setSortBy(event.target.value === 'meet' ? 'meet' : 'created')}
          >
            <option value="created">按提交时间</option>
            <option value="meet">按约会日期</option>
          </select>
          {/* 放大镜是「这里能搜」的通用语言，不用解释 */}
          <div className="search-group">
          <div className="search-field">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20.2 20.2 16.6 16.6" />
            </svg>
            <input
              className="input input-search"
              value={keyword}
              placeholder="搜昵称 / 地点 / 时间 / 留言"
              onChange={(event) => setKeyword(event.target.value)}
            />
            {keyword !== '' && (
              <button
                type="button"
                className="search-clear"
                title="清空搜索词"
                aria-label="清空搜索"
                onClick={() => setKeyword('')}
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            className={refreshing ? 'icon-btn icon-btn-spin' : 'icon-btn'}
            title="重新拉一遍最新提交"
            aria-label="刷新"
            disabled={refreshing}
            onClick={() => void refreshByHand()}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
              <path d="M20.5 4.6v5h-5" />
            </svg>
          </button>
          </div>
        </div>
        <div className="custom-row">
          <button
            type="button"
            className="btn btn-ghost"
            title="导出当前筛出来的这些，存一份原始数据留档"
            onClick={() => exportAll()}
          >
            导出 JSON
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="导出成表格，Excel / 飞书表格能直接打开"
            onClick={() => exportCsv()}
          >
            导出 CSV
          </button>
          {(needle !== '' || role !== '' || status !== '') && (
            <span className="export-hint">（只导当前筛出来的 {visible.length} 条）</span>
          )}
        </div>
      </div>

      {error !== null && <p className="error-box">{error}</p>}
      {notice !== null && <p className="notice">{notice}</p>}

      {picked.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">已选 {picked.size} 条</span>
          <button
        type="button"
        className="btn btn-primary"
        title="把勾选的这些一次全批了"
        onClick={() => void runBatch('accepted')}
      >
            批量批准
          </button>
          <button
            type="button"
            className="btn btn-danger"
            title="把勾选的这些一次全驳回"
            onClick={() => void runBatch('cancelled')}
          >
            批量驳回
          </button>
          <button
            type="button"
            className="btn btn-danger"
            title="从库里删掉，好友那边也看不到了。删了就找不回来"
            onClick={() => void runBatch('delete')}
          >
            批量删除
          </button>
          <button
            type="button"
            className="btn btn-link"
            title="清空当前勾选，不删任何数据"
            onClick={() => setPicked(new Set())}
          >
            取消选择
          </button>
        </div>
      )}

      <div className="list-head">
        <label className="pick" title="全选 / 全不选（只作用于当前筛选结果）">
          <input
            type="checkbox"
            checked={allPicked}
            ref={(element) => {
              // 选了一部分时显示成「半选」
              if (element !== null) element.indeterminate = picked.size > 0 && !allPicked;
            }}
            onChange={toggleAll}
          />
        </label>
        <span className="block-hint">
          共 {items.length} 条
          {visible.length !== items.length ? `，筛出 ${visible.length} 条` : ''}
          {picked.size > 0 ? `，已选 ${picked.size}` : ''}
        </span>
      </div>

      <p className="list-order-hint">
        {sortBy === 'meet' ? (
          <>
            按<strong>约会日期</strong>排：最近要赴的排最前，已经过去的沉到最后。
          </>
        ) : (
          <>
            <strong>审批中</strong>和<strong>今天交上来的</strong>排在最前面。
          </>
        )}
      </p>

      <div className="admin-list">
        {visible.map((item) => (
          <div className="admin-item-wrap" key={item.id}>
            <div className={selected?.id === item.id ? 'admin-item admin-item-on' : 'admin-item'}>
              <label className="pick" title="选中这一条">
                <input
                  type="checkbox"
                  checked={picked.has(item.id)}
                  onChange={() => togglePick(item.id)}
                />
              </label>

              <button
                type="button"
                className="admin-item-main"
                title="点开看这条的完整内容和审批意见"
                onClick={() => setSelected(selected?.id === item.id ? null : item)}
              >
                <span className="admin-item-top">
                  <span className="admin-item-name">{item.name}</span>
                  <span className="admin-item-role">{roleLabelOf(item, config)}</span>
                  <span className={`badge badge-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  {isToday(item) && <span className="badge badge-today">今天</span>}
                  <span className="admin-item-stamp">{shortStamp(item.createdAt)} 交的</span>
                </span>
                <span className="admin-item-line">
                  <em>时间</em>
                  <span>{timeSummary(item, config)}</span>
                </span>
                <span className="admin-item-line">
                  <em>地点</em>
                  <span>{item.place === null ? '【由你定】' : item.place}</span>
                </span>
                {item.meetingNote !== '' && (
                  <span className="admin-item-line">
                    <em>要求</em>
                    <span>{item.meetingNote}</span>
                  </span>
                )}
                {item.message !== '' && (
                  <span className="admin-item-line">
                    <em>留言</em>
                    <span>{item.message}</span>
                  </span>
                )}
              </button>

              {/* 行内快捷操作：不用展开详情就能处理 */}
              <span className="admin-item-actions">
                <button
                  type="button"
                  className="btn btn-mini btn-mini-ok"
                  title="直接批准这条，不用展开详情"
                  disabled={item.status === 'accepted'}
                  onClick={() => void patchOne(item.id, 'accepted')}
                >
                  批准
                </button>
                <button
                  type="button"
                  className="btn btn-mini btn-mini-no"
                  title="直接驳回这条，不用展开详情"
                  disabled={item.status === 'cancelled'}
                  onClick={() => void patchOne(item.id, 'cancelled')}
                >
                  驳回
                </button>
              </span>
            </div>

            {selected?.id === item.id && (
              <SubmissionDetail
                submission={item}
                config={config}
                onChanged={(next) => {
                  setSelected(next);
                  void reload();
                }}
                onDeleted={() => {
                  setSelected(null);
                  void reload();
                }}
              />
            )}
          </div>
        ))}
        {items.length === 0 && <p className="block-hint">还没有人提交。</p>}
        {items.length > 0 && visible.length === 0 && (
          <p className="block-hint">没有匹配的，换个词试试。</p>
        )}
      </div>
    </section>
  );
}

function SubmissionDetail({
  submission,
  config,
  onChanged,
  onDeleted,
}: {
  submission: Submission;
  config: AppConfig | null;
  onChanged: (next: Submission) => void;
  onDeleted: () => void;
}) {
  const [note, setNote] = useState(submission.adminNote);
  const [place, setPlace] = useState(submission.place ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNote(submission.adminNote);
    setPlace(submission.place ?? '');
  }, [submission]);

  /** 审批结果 + 安排，拼成一段能直接粘进微信的话。 */
  function replyText(): string {
    // 用**提交这条的身份**的文案，四个身份口气不一样
    const copies = config === null ? null : copiesFor(config, submission.role);
    const result =
      submission.status === 'accepted'
        ? `批了。${copies?.acceptedSub ?? '到时候见。'}`
        : submission.status === 'cancelled'
          ? `这次没约上。${submission.adminNote.trim() === '' ? (copies?.rejected ?? '') : submission.adminNote.trim()}`
          : '还在审批中，等我回你。';

    return [
      `【${config?.site.title ?? '约会审批'}】`,
      `${submission.name}（${roleLabelOf(submission, config)}）`,
      `时间：${timeSummary(submission, config)}`,
      `地点：${submission.place === null ? '【由你定】' : submission.place}`,
      `结果：${result}`,
    ].join('\n');
  }

  async function copyReply(): Promise<void> {
    const text = replyText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 非 https 或老浏览器：退回老办法
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function act(action: () => Promise<Submission>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
    } catch (cause) {
      setError(errText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail">
      <h3 className="detail-title">申请详情</h3>

      {error !== null && <p className="error-box">{error}</p>}

      {/* 先看人和安排，设备号这种排查信息只在最下面的原始 JSON 里 */}
      <dl className="receipt-list">
        <div>
          <dt>人物</dt>
          <dd className="dd-strong">
            {submission.name}（{roleLabelOf(submission, config)}）
          </dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd className="dd-strong">
            {submission.slots.map((item) => (
              <span key={`${item.date}|${item.slot}`} className="receipt-custom">
                {shortDate(item.date)}{' '}
                {config?.slots.find((slot) => slot.key === item.slot)?.label ?? item.slot}
              </span>
            ))}
            {submission.customTimes.map((item) => (
              <span key={`${item.date}|${item.text}`} className="receipt-custom">
                {shortDate(item.date)} · {item.text}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>地点</dt>
          <dd className="dd-strong">
            {submission.place === null ? '【由你定】' : submission.place}
          </dd>
        </div>
        {submission.meetingNote !== '' && (
          <div>
            <dt>好友的要求</dt>
            <dd className="dd-strong">{submission.meetingNote}</dd>
          </div>
        )}
        <div>
          <dt>留言</dt>
          <dd>{submission.message === '' ? '（没留）' : submission.message}</dd>
        </div>
        <div>
          <dt>提交时间</dt>
          <dd>{submission.createdAt.slice(0, 19).replace('T', ' ')}</dd>
        </div>
      </dl>

      {/*
        好友那边**没有任何通知**，只能自己反复回来看。
        所以给牛马一个「复制回复」——审批完直接粘到微信发过去，闭环就补上了。
      */}
      <div className="copy-reply">
        <button
          type="button"
          className="btn btn-ghost"
          title="生成一段能直接粘进微信的回复，好友那边收不到通知"
          onClick={() => void copyReply()}
        >
          {copied ? '已复制 ✓' : '复制回复话术'}
        </button>
        <span className="copy-reply-hint">粘到微信发给 TA（好友那边收不到通知）</span>
      </div>

      <label className="field">
        <span>地点（留空即保持【由你定】）</span>
        <div className="custom-row">
          <input
            className="input"
            value={place}
            placeholder="你定好的地点"
            onChange={(event) => setPlace(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            title="把这里填的地点写进去；留空就是保持「由你定」"
            onClick={() => void act(() => api.admin.patch(submission.id, { place: place.trim() === '' ? null : place.trim() }))}
          >
            保存地点
          </button>
        </div>
      </label>

      <label className="field">
        <span>审批意见（好友在回执上一定看得到，支持换行）</span>
        <div className="quick-notes">
          {QUICK_NOTES.map((phrase) => (
            <button
              key={phrase}
              type="button"
              className="chip"
              title="点一下填进审批意见"
              onClick={() => setNote(phrase)}
            >
              {phrase}
            </button>
          ))}
        </div>
        <textarea
          className="input textarea note-input"
          rows={3}
          value={note}
          placeholder="批准了就说点期待的话；驳回了最好写清为什么。可以换行，好友那边会原样显示。"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>



      <div className="row-wrap">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          title="改回「待审批」，把审批意见一起存下来"
          onClick={() => void act(() => api.admin.patch(submission.id, { adminNote: note, status: 'pending' }))}
        >
          待审批
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          title="批准这条，审批意见会一起存下来"
          onClick={() => void act(() => api.admin.patch(submission.id, { adminNote: note, status: 'accepted' }))}
        >
          批准
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          title="驳回这条，审批意见好友一定看得到"
          onClick={() => void act(() => api.admin.patch(submission.id, { adminNote: note, status: 'cancelled' }))}
        >
          驳回
        </button>
        <button
          type="button"
          className="btn btn-danger"
          title="从库里删掉这条，好友那边也看不到了。删了就找不回来"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('删掉这条申请？好友那边也看不到了。')) return;
            void (async () => {
              try {
                await api.admin.remove(submission.id);
                onDeleted();
              } catch (cause) {
                setError(errText(cause));
              }
            })();
          }}
        >
          删除
        </button>
      </div>

      <details className="raw">
        <summary>原始 JSON</summary>
        <pre>{JSON.stringify(submission, null, 2)}</pre>
      </details>
    </div>
  );
}


/** 星期几，从日期串自己算，不依赖别处的工具。 */
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getDay();
}

/** 出现次数最多的一项。 */
function topOf(counts: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (best === null || count > best.count) best = { key, count };
  }
  return best;
}

/**
 * 牛马年报。
 *
 * 把后台的数据翻成一张自嘲的总结 —— 这个应用既然走「牛马」这个调性，
 * 就该有个地方能让牛马回头看看自己今年被约了多少次、熬到几点。
 */
function YearReport({ config }: { config: AppConfig | null }) {
  const [items, setItems] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setItems((await api.admin.list({})).items);
      } catch (cause) {
        setError(errText(cause));
      }
    })();
  }, []);

  if (error !== null) {
    return (
      <section className="block">
        <p className="block-hint">{error}</p>
      </section>
    );
  }

  if (items === null) {
    return (
      <section className="block">
        <p className="block-hint">正在翻牛马的旧账……</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="block">
        <h2 className="block-title">牛马年报</h2>
        <p className="block-hint">还一单都没有。牛马暂时很闲，快去约它。</p>
      </section>
    );
  }

  const total = items.length;
  const pending = items.filter((item) => item.status === 'pending').length;
  const accepted = items.filter((item) => item.status === 'accepted').length;
  const cancelled = items.filter((item) => item.status === 'cancelled').length;
  const passRate = accepted + cancelled === 0 ? 0 : Math.round((accepted / (accepted + cancelled)) * 100);

  const people = new Set(items.map((item) => item.deviceId)).size;

  // 被约得最多的时段
  const slotCounts = new Map<string, number>();
  const weekdayCounts = new Map<string, number>();
  for (const item of items) {
    for (const pick of item.slots) {
      const label = config?.slots.find((slot) => slot.key === pick.slot)?.label ?? pick.slot;
      slotCounts.set(label, (slotCounts.get(label) ?? 0) + 1);
      const name = WEEKDAY_NAMES[weekdayOf(pick.date)] ?? '';
      weekdayCounts.set(name, (weekdayCounts.get(name) ?? 0) + 1);
    }
  }
  const topSlot = topOf(slotCounts);
  const topWeekday = topOf(weekdayCounts);

  // 地点：不统计「由你定」
  const placeCounts = new Map<string, number>();
  for (const item of items) {
    if (item.place !== null && item.place.trim() !== '') {
      placeCounts.set(item.place, (placeCounts.get(item.place) ?? 0) + 1);
    }
  }
  const topPlace = topOf(placeCounts);
  const undecided = items.filter((item) => item.place === null).length;

  // 最晚一次是几点交的
  const latest = items
    .map((item) => new Date(item.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getHours() * 60 + a.getMinutes() - (b.getHours() * 60 + b.getMinutes()))
    .at(-1);
  const latestText =
    latest === undefined
      ? ''
      : `${String(latest.getHours()).padStart(2, '0')}:${String(latest.getMinutes()).padStart(2, '0')}`;

  return (
    <section className="block">
      <h2 className="block-title">牛马年报</h2>
      <p className="block-hint">翻了翻旧账，随便看看。</p>

      <div className="report">
        <p className="report-line">
          一共有 <strong>{people}</strong> 位好友，
          <br />
          向牛马发起了 <strong>{total}</strong> 次约会申请。
        </p>

        <p className="report-line">
          批了 <strong>{accepted}</strong> 次，拒了 <strong>{cancelled}</strong> 次，
          还有 <strong>{pending}</strong> 次压在牛马手里没审。
          {accepted + cancelled > 0 && <>（通过率 <strong>{passRate}%</strong>）</>}
        </p>

        {(topSlot !== null || topWeekday !== null) && (
          <p className="report-line">
            {topSlot !== null && (
              <>
                被约得最多的是<strong>{topSlot.key}</strong>（{topSlot.count} 次）。
                <br />
              </>
            )}
            {topWeekday !== null && (
              <>
                最抢手的日子是<strong>{topWeekday.key}</strong>。
              </>
            )}
          </p>
        )}

        {latestText !== '' && (
          <p className="report-line">
            最晚一次是 <strong>{latestText}</strong> 交的。
            <br />
            那个点，牛马还在工位上。
          </p>
        )}

        {(topPlace !== null || undecided > 0) && (
          <p className="report-line">
            {topPlace !== null && (
              <>
                去得最多的地方是<strong>{topPlace.key}</strong>（{topPlace.count} 次）。
                <br />
              </>
            )}
            {undecided > 0 && (
              <>
                还有 <strong>{undecided}</strong> 次是「由你定」—— 说白了就是让牛马自己想。
              </>
            )}
          </p>
        )}

        <p className="report-foot">牛马字〔{new Date().getFullYear()}〕年终总结</p>
      </div>
    </section>
  );
}

function SettingsPanel({
  siteOpen,
  onDirtyChange,
}: {
  siteOpen: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [imported, setImported] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirtyRef = useRef(false);

  /**
   * 标成「有未保存的改动」。
   *
   * 用 ref 兜一层是为了只在「干净 → 脏」那一次通知外层，
   * 否则每敲一个字都会把整个后台重渲染一遍。
   */
  const markDirty = useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    setDirty(true);
    onDirtyChange(true);
  }, [onDirtyChange]);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
    onDirtyChange(false);
  }, [onDirtyChange]);

  // 总开关在别处被点过之后，这里也要跟上，免得保存时把它覆盖回去
  useEffect(() => {
    setCfg((current) =>
      current === null ? current : { ...current, site: { ...current.site, open: siteOpen } },
    );
  }, [siteOpen]);

  useEffect(() => {
    void (async () => {
      try {
        setCfg(await api.admin.getConfig());
      } catch (cause) {
        setError(errText(cause));
      }
    })();
  }, []);

  if (cfg === null) {
    return (
      <section className="block">
        <p className="block-hint">{error ?? '加载配置中…'}</p>
      </section>
    );
  }

  function patchRole(index: number, patch: Partial<RoleConfig>): void {
    setCfg((current) =>
      current === null
        ? current
        : { ...current, roles: current.roles.map((role, i) => (i === index ? { ...role, ...patch } : role)) },
    );
    markDirty();
  }

  /** 一键套用某个身份的男生版 / 女生版语气。 */
  function applyVoice(index: number, voice: VoiceKey): void {
    const role = cfg?.roles[index];
    if (role === undefined) return;
    if (!window.confirm(`把「${role.label}」的文案整套换成${VOICE_LABELS[voice]}？现在改过的会被覆盖。`)) {
      return;
    }

    setCfg((current) =>
      current === null
        ? current
        : {
            ...current,
            roles: current.roles.map((item, i) =>
              i === index ? { ...item, copies: { ...VOICE_PRESETS[item.key][voice] } } : item,
            ),
          },
    );
    markDirty();
  }

  /** 改某个身份的某条文案。 */
  function patchRoleCopies(index: number, key: keyof RoleCopies, value: string): void {
    setCfg((current) =>
      current === null
        ? current
        : {
            ...current,
            roles: current.roles.map((role, i) =>
              i === index ? { ...role, copies: { ...role.copies, [key]: value } } : role,
            ),
          },
    );
    markDirty();
  }

  function patchPreset(index: number, patch: Partial<WorkSchedule>): void {
    setCfg((current) =>
      current === null
        ? current
        : {
            ...current,
            schedule: {
              ...current.schedule,
              presets: current.schedule.presets.map((preset, i) =>
                i === index ? { ...preset, ...patch } : preset,
              ),
            },
          },
    );
    markDirty();
  }

  async function save(): Promise<void> {
    if (cfg === null) return;
    setBusy(true);
    try {
      const next = await api.admin.saveConfig(cfg);
      setCfg(next);
      markClean();
      setJustSaved(true);
      setError(null);
    } catch (cause) {
      setError(errText(cause));
    } finally {
      setBusy(false);
    }
  }

  /** 导出当前配置，升级版本前先存一份。 */
  function exportConfig(): void {
    if (cfg === null) return;
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `niumadate-config-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** 读入一份导出的配置。新版多出来的字段会自动补默认值。 */
  function importConfig(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = ''; // 允许重复选同一个文件
    if (file === undefined) return;

    void (async () => {
      try {
        const parsed: unknown = JSON.parse(await file.text());
        setCfg(normalizeConfig(parsed));
        markDirty();
        setImported(true);
        setError(null);
      } catch (cause) {
        setError(`这个文件读不了：${errText(cause)}`);
      }
    })();
  }

  /** 一键恢复出厂默认。 */
  async function resetToDefault(): Promise<void> {
    if (!window.confirm('会丢掉你现在所有的配置改动，恢复成出厂默认。确定吗？')) return;
    setBusy(true);
    try {
      setCfg(await api.admin.resetConfig());
      markClean();
      setJustSaved(true);
      setImported(false);
      setError(null);
    } catch (cause) {
      setError(errText(cause));
    } finally {
      setBusy(false);
    }
  }

  /** 放弃改动：直接从服务器重新拉一份。 */
  async function discard(): Promise<void> {
    setBusy(true);
    try {
      setCfg(await api.admin.getConfig());
      markClean();
      setJustSaved(false);
      setError(null);
    } catch (cause) {
      setError(errText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="block settings-panel">
      <datalist id="time-options">
        {TIME_OPTIONS.map((time) => (
          <option key={time} value={time} />
        ))}
      </datalist>


      {error !== null && <p className="error-box">{error}</p>}

      <h2 className="block-title">站点</h2>
      <label className="field">
        <span>站名</span>
        <input
          className="input"
          value={cfg.site.title}
          onChange={(event) => {
            setCfg({ ...cfg, site: { ...cfg.site, title: event.target.value } });
            markDirty();
          }}
        />
      </label>
      <label className="field">
        <span>副标题</span>
        <input
          className="input"
          value={cfg.site.subtitle}
          onChange={(event) => {
            setCfg({ ...cfg, site: { ...cfg.site, subtitle: event.target.value } });
            markDirty();
          }}
        />
      </label>
      <p className="block-hint">
        文号（{buildDocNumber()}）按当前年份自动生成，不需要也不能改。
      </p>

      <h2 className="block-title">配置备份</h2>
      <p className="block-hint">
        <strong>升级版本之前先导出一份。</strong>
        新版多出来的配置项，导入旧文件时会自动补上默认值，不会因为少字段出错。
      </p>
      <div className="row-wrap">
        <button
          type="button"
          className="btn btn-ghost"
          title="下载一份 JSON，升级版本前先存着"
          onClick={() => exportConfig()}
        >
          导出配置
        </button>
        <label className="btn btn-ghost backup-import" title="读入之前导出的 JSON；新版多出来的字段会自动补默认值">
          导入配置
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => importConfig(event)}
          />
        </label>
        <button
          type="button"
          className="btn btn-danger"
          title="全部回到出厂设置。会把当前配置整个冲掉，问一次才动手"
          disabled={busy}
          onClick={() => void resetToDefault()}
        >
          恢复默认配置
        </button>
      </div>
      {imported && (
        <p className="block-hint">文件已经读进来了，确认没问题再点底下的「保存配置」。</p>
      )}
      <p className="block-hint">接单总开关在页面最上面那条，随手就能点。</p>

      <h2 className="block-title">身份卡片</h2>
      {cfg.roles.map((role, index) => (
        <div className="sub-card" key={role.key}>
          <div className="custom-row">
            <label className="check">
              <input
                type="checkbox"
                checked={role.enabled}
                onChange={(event) => patchRole(index, { enabled: event.target.checked })}
              />
              <span>受理中</span>
            </label>
            <input
              className="input input-sm"
              value={role.emoji}
              maxLength={4}
              onChange={(event) => patchRole(index, { emoji: event.target.value })}
            />
            <input
              className="input"
              value={role.label}
              onChange={(event) => patchRole(index, { label: event.target.value })}
            />
          </div>
          <label className="field">
            <span>一句话</span>
            <input
              className="input"
              value={role.tagline}
              onChange={(event) => patchRole(index, { tagline: event.target.value })}
            />
          </label>
          <label className="field">
            <span>视觉主题（背景 / 字体 / 边框方圆 / 配色，一整套）</span>
            <select
              className="input"
              value={role.theme}
              onChange={(event) => patchRole(index, { theme: event.target.value as ThemeKey })}
            >
              {THEME_KEYS.map((key) => (
                <option key={key} value={key}>
                  {THEME_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <div className="custom-row">
            <label className="check">
              <input
                type="checkbox"
                checked={role.askName}
                onChange={(event) => patchRole(index, { askName: event.target.checked })}
              />
              <span>问名号</span>
            </label>
            {!role.askName && (
              <input
                className="input input-sm"
                value={role.nameDefault}
                placeholder="不问时用这个名（比如：宝宝）"
                onChange={(event) => patchRole(index, { nameDefault: event.target.value })}
              />
            )}
          </div>
          {!role.askName && (
            <p className="block-hint">
              这个身份不会出现「怎么称呼你」那一步 —— 牛马心里有数，还让人自报家门很怪。
            </p>
          )}
          <label className="field">
            <span>关闭时甩的话</span>
            <input
              className="input"
              value={role.closedText}
              onChange={(event) => patchRole(index, { closedText: event.target.value })}
            />
          </label>
        </div>
      ))}

      <h2 className="block-title">工作制（决定哪些时段被冻住）</h2>
      <label className="field">
        <span>当前生效</span>
        <select
          className="input"
          value={cfg.schedule.active}
          onChange={(event) => {
            setCfg({ ...cfg, schedule: { ...cfg.schedule, active: event.target.value } });
            markDirty();
          }}
        >
          {cfg.schedule.presets.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.key}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>锁定规则</span>
        <select
          className="input"
          value={cfg.schedule.lockMode}
          onChange={(event) => {
            setCfg({
              ...cfg,
              schedule: {
                ...cfg.schedule,
                lockMode: event.target.value === 'overlap' ? 'overlap' : 'covered',
              },
            });
            markDirty();
          }}
        >
          <option value="covered">covered — 时段完全落在工作时间内才锁（默认，只锁中午）</option>
          <option value="overlap">overlap — 只要和工作时间有交集就锁（更狠）</option>
        </select>
      </label>
      {cfg.schedule.presets.map((preset, index) => (
        <div className="sub-card" key={preset.key}>
          <p className="sub-title">{preset.key}</p>
          <p className="block-hint">
            一天都不选 = 这星期哪天都不上班（比如放假在家），所有时段都不会被锁。不会退回默认。
          </p>
          <div className="weekdays">
            {WEEKDAYS.map((day) => (
              <label className="check" key={day.value}>
                <input
                  type="checkbox"
                  checked={preset.workdays.includes(day.value)}
                  onChange={(event) =>
                    patchPreset(index, {
                      workdays: event.target.checked
                        ? [...preset.workdays, day.value].sort((a, b) => a - b)
                        : preset.workdays.filter((value) => value !== day.value),
                    })
                  }
                />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
          <div className="custom-row">
            <label className="field">
              <span>上班</span>
              <input
                className="input input-sm"
                list="time-options"
                value={preset.workStart}
                onChange={(event) => patchPreset(index, { workStart: event.target.value })}
              />
            </label>
            <label className="field">
              <span>下班</span>
              <input
                className="input input-sm"
                list="time-options"
                value={preset.workEnd}
                onChange={(event) => patchPreset(index, { workEnd: event.target.value })}
              />
            </label>
          </div>
        </div>
      ))}

      <h2 className="block-title">时段</h2>
      <p className="block-hint">时间既能直接敲，也能点开下拉挑。</p>
      {cfg.slots.map((slot, index) => (
        <div className="sub-card" key={slot.key}>
          <p className="sub-title">{slot.key}</p>
          <div className="custom-row">
            <label className="field">
              <span>名字</span>
              <input
                className="input input-sm"
                value={slot.label}
                onChange={(event) => {
                  setCfg({
                    ...cfg,
                    slots: cfg.slots.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)),
                  });
                  markDirty();
                }}
              />
            </label>
            <label className="field">
              <span>开始</span>
              <input
                className="input input-sm"
                list="time-options"
                value={slot.start}
                onChange={(event) => {
                  setCfg({
                    ...cfg,
                    slots: cfg.slots.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)),
                  });
                  markDirty();
                }}
              />
            </label>
            <label className="field">
              <span>结束</span>
              <input
                className="input input-sm"
                list="time-options"
                value={slot.end}
                onChange={(event) => {
                  setCfg({
                    ...cfg,
                    slots: cfg.slots.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)),
                  });
                  markDirty();
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={slot.selectable}
                onChange={(event) => {
                  setCfg({
                    ...cfg,
                    slots: cfg.slots.map((item, i) =>
                      i === index ? { ...item, selectable: event.target.checked } : item,
                    ),
                  });
                  markDirty();
                }}
              />
              <span>可选中</span>
            </label>
          </div>
          {!slot.selectable && <p className="block-hint">关掉之后好友端只展示这一格，点不了。</p>}
        </div>
      ))}

      <h2 className="block-title">规则开关</h2>
      <label className="field">
        <span>可选天数（从今天起）</span>
        <input
          className="input input-sm"
          type="number"
          min={1}
          max={90}
          value={cfg.dateRangeDays}
          onChange={(event) => {
            setCfg({ ...cfg, dateRangeDays: Number(event.target.value) });
            markDirty();
          }}
        />
      </label>
      <label className="field">
        <span>约会日后第几天允许重新填写（1 = 第二天）</span>
        <input
          className="input input-sm"
          type="number"
          min={1}
          max={30}
          value={cfg.reopenAfterDays}
          onChange={(event) => {
            setCfg({ ...cfg, reopenAfterDays: Number(event.target.value) });
            markDirty();
          }}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={cfg.allowCustomTime}
          onChange={(event) => {
            setCfg({ ...cfg, allowCustomTime: event.target.checked });
            markDirty();
          }}
        />
        <span>允许好友自己加一条时间</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={cfg.allowMultipleSlots}
          onChange={(event) => {
            setCfg({ ...cfg, allowMultipleSlots: event.target.checked });
            markDirty();
          }}
        />
        <span>允许多选时段</span>
      </label>

      <h2 className="block-title">冷热小人（中午热 / 晚上冷）</h2>
      <p className="block-hint">
        <strong>中午太热、晚上太冷</strong>——夏天最热是中午，冬天最冷是晚上。
        不在下面两个列表里的月份，对应时段就不会显示冷热小人。
        月份<strong>既能点格子选，也能直接在输入框里敲</strong>（逗号分隔）。
        <strong>全不选就是全不选</strong>：那个时段整年都不显示冷热，不会偷偷退回默认值。
      </p>

      {(
        [
          ['hotMonths', '中午显示「太热」的月份'],
          ['coldMonths', '晚上显示「太冷」的月份'],
        ] as const
      ).map(([key, label]) => {
        const selected = cfg.season[key];
        const toggle = (month: number) => {
          setCfg({
            ...cfg,
            season: {
              ...cfg.season,
              [key]: selected.includes(month)
                ? selected.filter((value) => value !== month)
                : [...selected, month].sort((a, b) => a - b),
            },
          });
          markDirty();
        };

        return (
          <div className="sub-card" key={key}>
            <p className="sub-title">{label}</p>
            <div className="month-chips">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <button
                  key={month}
                  type="button"
                  className={selected.includes(month) ? 'month-chip month-chip-on' : 'month-chip'}
                  title={month + ' 月：点一下选中 / 取消'}
                  onClick={() => toggle(month)}
                >
                  {month}
                </button>
              ))}
            </div>
            <input
              className="input"
              value={selected.join(',')}
              placeholder="也可以直接敲，比如 6,7,8"
              onChange={(event) => {
                setCfg({
                  ...cfg,
                  season: { ...cfg.season, [key]: parseMonths(event.target.value) },
                });
                markDirty();
              }}
            />
          </div>
        );
      })}

      <h2 className="block-title">地点玩法</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={cfg.place.allowLetYouDecide}
          onChange={(event) => {
            setCfg({ ...cfg, place: { ...cfg.place, allowLetYouDecide: event.target.checked } });
            markDirty();
          }}
        />
        <span>允许「让你定」</span>
      </label>
      {(
        [
          ['placeholder', '输入框提示'],
          ['decideLabel', '按钮文案'],
          ['teaseLabel', '躲闪后文案'],
          ['decidedLabel', '接受后显示'],
        ] as const
      ).map(([key, label]) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <input
            className="input"
            value={cfg.place[key]}
            onChange={(event) => {
              setCfg({ ...cfg, place: { ...cfg.place, [key]: event.target.value } });
              markDirty();
            }}
          />
        </label>
      ))}

      <h2 className="block-title">文案（每个身份一套）</h2>
      <p className="block-hint">
        四个身份本来就该是<strong>四种口气</strong>：兄弟直来直去、姐妹温柔、宝宝撒娇、
        父母一本正经。下面每个身份一套，<strong>点标题展开</strong>（不然太长）。改哪个都不影响其他三个。
      </p>

      {cfg.roles.map((role, index) => (
        <details className="copy-block" key={role.key}>
          <summary>
            <span className="copy-block-name">{role.label}</span>
            <span className="copy-block-hint">{COPY_VOICE[role.key]}</span>
          </summary>
          <div className="copy-block-body">
            <div className="copy-presets">
              <span className="copy-presets-label">一键套用：</span>
              {VOICE_KEYS.map((voice) => (
                <button
                  key={voice}
                  type="button"
                  className="btn btn-ghost btn-mini"
                  title={`把「${role.label}」这 11 条整套换成${VOICE_LABELS[voice]}；现在改过的会被覆盖（点「放弃改动」能退回来）`}
                  onClick={() => applyVoice(index, voice)}
                >
                  {VOICE_LABELS[voice]}
                </button>
              ))}
            </div>
            {ROLE_COPY_FIELDS.map(([key, label]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <input
                  className="input"
                  value={role.copies[key]}
                  onChange={(event) => patchRoleCopies(index, key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </details>
      ))}

      <details className="copy-block">
        <summary>
          <span className="copy-block-name">全站</span>
          <span className="copy-block-hint">跟身份无关的那几条</span>
        </summary>
        <div className="copy-block-body">
          <label className="field">
            <span>暂停营业时的话（好友端卷帘门上那句）</span>
            <input
              className="input"
              value={cfg.copies.siteClosed}
              onChange={(event) => {
                setCfg({ ...cfg, copies: { ...cfg.copies, siteClosed: event.target.value } });
                markDirty();
              }}
            />
          </label>
        </div>
      </details>

      {/*
        保存条固定在视口底部。
        之前按钮在整页最下面，改完上面的字段得一路滑到底才能存，太别扭。
      */}
      <div className={dirty ? 'save-bar save-bar-dirty' : 'save-bar'}>
        <span className="save-bar-text">
          {dirty ? '有未保存的改动' : justSaved ? '已保存，前端立即生效' : '配置已是最新'}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          title="丢掉没保存的改动，重新从服务器拉一份"
          disabled={!dirty || busy}
          onClick={() => void discard()}
        >
          放弃改动
        </button>
        <button
          type="button"
          className="btn btn-primary save-bar-btn"
          title="保存后前端立即生效，不用重启"
          disabled={!dirty || busy}
          onClick={() => void save()}
        >
          {busy ? '保存中…' : '保存配置'}
        </button>
      </div>
    </section>
  );
}
