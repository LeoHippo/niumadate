import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { buildDayRows, buildDocNumber, copiesFor, findRole, isRoleKey } from '@niumadate/shared';
import type { SlotCell, SlotDef } from '@niumadate/shared';
import { api, describeError } from '../api';
import {
  Calendar,
  LockTip,
  NiumaMark,
  NoteModal,
  PlaceField,
  Puppet,
  SiteClosed,
  WizardProgress,
} from '../components';
import { ConfigContext } from '../config-context';
import { usePageTheme } from '../theme';
import {
  clearDraft,
  composeCustomText,
  describeSelection,
  fillCopy,
  getDeviceId,
  isSubmissionActive,
  loadDraft,
  saveDraft,
  shortDate,
  slotKey,
} from '../lib';
import type { Draft } from '../lib';
import { useMySubmission } from '../use-submission';

/** 一个问题一页。custom 是可选的支线，不计入主线进度。 */
type Step = 'name' | 'date' | 'slot' | 'custom' | 'place' | 'extras' | 'review';

/** 主线步骤，决定进度点和上一步 / 下一步。 */
const CHAIN: Step[] = ['name', 'date', 'slot', 'place', 'extras', 'review'];

/** 「几点」的候选，能直接敲也能从下拉里挑。 */
const TIME_HINTS = [
  '凌晨三点',
  '早上七点',
  '上午十点',
  '中午十二点',
  '下午三点',
  '傍晚六点',
  '晚上八点',
  '晚上十点',
  '通宵',
];

type Tip = { cell: SlotCell; slot: SlotDef; anchor: HTMLElement };

/**
 * 填写页。只管填写。
 *
 * 已经有生效中的申请时，直接转到状态页 —— 判断逻辑只有这一处，
 * 不会再出现「被驳回后回来又看到驳回页」那种绕不出去的情况。
 */
export function BookingPage() {
  const config = useContext(ConfigContext);
  const navigate = useNavigate();
  const params = useParams();
  const roleKey = params.role ?? '';

  const { submission, loading } = useMySubmission(roleKey);

  const [draft, setDraft] = useState<Draft>(() => loadDraft(roleKey));
  const [rawStep, setRawStep] = useState<Step>('name');
  const [pendingDate, setPendingDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [customActivity, setCustomActivity] = useState('');
  const [tip, setTip] = useState<Tip | null>(null);
  const [morningOpen, setMorningOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const role = config === null || !isRoleKey(roleKey) ? undefined : findRole(config, roleKey);

  // 钩子必须在任何提前 return 之前调用，否则钩子数量会时多时少
  usePageTheme(role?.theme);

  /**
   * 好宝宝和父母跳过「怎么称呼你」这一步。
   *
   * 这两个身份牛马心里有数，还让人自报家门就很怪。
   * 名字改用配置里的 nameDefault（默认「宝宝」「爸妈」）。
   */
  const asksName = role?.askName !== false;
  const chain = useMemo(
    () => (asksName ? CHAIN : CHAIN.filter((item) => item !== 'name')),
    [asksName],
  );

  // 不问名号时，step 一开始就落在链子的第一页，不会闪一下名号页
  const step: Step = rawStep === 'name' && !asksName ? (chain[0] ?? 'date') : rawStep;

  /** 真正交上去的名字。 */
  const resolvedName =
    draft.name.trim() !== '' ? draft.name.trim() : (role?.nameDefault.trim() || (role?.label ?? ''));

  const rows = useMemo(() => (config === null ? [] : buildDayRows(config)), [config]);
  const deviceId = useMemo(() => getDeviceId(), []);

  useEffect(() => {
    if (role === undefined) return;
    saveDraft(role.key, draft);
  }, [draft, role]);

  /**
   * 之前交过单子（被驳回或已过期）就把「不用重想的字段」带过来：
   * 昵称、地点、留言。
   *
   * 刻意**不带时间** —— 被驳回或已经过去的那几个时段，多半就是不能用的那几个，
   * 带过来反而容易误选。
   */
  const prefilledFrom = useRef<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (submission === null || submission === undefined) return;
    if (prefilledFrom.current === submission.id) return;
    prefilledFrom.current = submission.id;

    setDraft((current) => ({
      ...current,
      name: current.name.trim() !== '' ? current.name : submission.name,
      place: current.place.trim() !== '' ? current.place : (submission.place ?? ''),
      placeDecided: current.placeDecided || submission.place === null,
      message: current.message.trim() !== '' ? current.message : submission.message,
      meetingNote: current.meetingNote.trim() !== '' ? current.meetingNote : submission.meetingNote,
    }));
    setPrefilled(true);
  }, [submission]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTip(null);
  }, [step]);

  // 提示不能一直赖着：点别处关、几秒后自己关
  useEffect(() => {
    if (tip === null) return;

    const autoClose = window.setTimeout(() => setTip(null), 3200);
    const closeOnClick = () => setTip(null);
    // 延后一拍再挂监听，免得被「打开它的那一次点击」立刻关掉
    const arm = window.setTimeout(() => document.addEventListener('click', closeOnClick), 0);

    return () => {
      window.clearTimeout(autoClose);
      window.clearTimeout(arm);
      document.removeEventListener('click', closeOnClick);
    };
  }, [tip]);

  const goto = useCallback((next: Step) => setRawStep(next), []);

  function back(): void {
    if (step === 'custom') {
      setRawStep('slot');
      return;
    }
    const index = chain.indexOf(step);
    if (index > 0) setRawStep(chain[index - 1] ?? 'date');
  }

  function next(): void {
    if (step === 'custom') {
      setRawStep('place');
      return;
    }
    const index = chain.indexOf(step);
    if (index >= 0 && index < chain.length - 1) setRawStep(chain[index + 1] ?? 'review');
  }

  /** 点一下选中、再点一下取消。 */
  function toggleSlot(cell: SlotCell, slot: SlotDef): void {
    if (config === null) return;
    const key = slotKey(cell.date, slot.key);

    setDraft((current) => {
      if (current.slots.includes(key)) {
        return { ...current, slots: current.slots.filter((item) => item !== key) };
      }
      if (!config.allowMultipleSlots) return { ...current, slots: [key] };
      return { ...current, slots: [...current.slots, key] };
    });
  }

  async function submit(): Promise<void> {
    if (role === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await api.submit({
        role: role.key,
        name: resolvedName,
        deviceId,
        slots: draft.slots.flatMap((item) => {
          const [date, slot] = item.split('|');
          if (date === undefined || slot === undefined) return [];
          return [{ date, slot }];
        }),
        customTimes: draft.customTimes,
        place: draft.placeDecided ? null : draft.place.trim(),
        message: draft.message.trim(),
        meetingNote: draft.meetingNote.trim(),
      });
      clearDraft(role.key);
      navigate(`/status/${role.key}`, { replace: true });
    } catch (cause) {
      setError(describeError(cause));
      setBusy(false);
    }
  }

  if (config === null) return null;

  // 总开关关掉就不再收单（已经交过的仍然能看回执，走的是状态页）
  if (!config.site.open) return <SiteClosed config={config} />;

  if (role === undefined) {
    return (
      <main className="paper">
        <p className="art-text">查无此身份</p>
        <div className="row-center">
          <button
            type="button"
            className="btn btn-primary"
            title="回到身份选择页"
            onClick={() => navigate('/')}
          >
            回入口页
          </button>
        </div>
      </main>
    );
  }

  if (!role.enabled) {
    return (
      <main className="paper" data-theme={role.theme}>
        <header className="redhead">
          <h1 className="redhead-title">{role.copies.closedTitle}</h1>
        </header>
        <div className="rule" />
        <p className="art-text">{role.closedText}</p>
        <Puppet mood="cold" />
        <div className="row-center">
          <button
            type="button"
            className="btn btn-primary"
            title="回到身份选择页"
            onClick={() => navigate('/')}
          >
            回入口页
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="paper" data-theme={role.theme}>
        <p className="boot-title">牛马正在赶来……</p>
      </main>
    );
  }

  // 手上有生效中的单子：填写页没什么可填的，去状态页
  if (submission !== null && submission !== undefined && isSubmissionActive(submission, config.reopenAfterDays)) {
    return <Navigate to={`/status/${roleKey}`} replace />;
  }

  // ---------- 向导 ----------
  /** 这个身份最终生效的文案：全局打底，身份覆盖。 */
  const copies = copiesFor(config, role.key);
  const stepIndex = Math.max(0, chain.indexOf(step === 'custom' ? 'slot' : step));
  const pickedForPending = draft.slots.filter((key) => key.startsWith(`${pendingDate}|`));
  const pendingRow = rows.find((row) => row.date === pendingDate);
  const markedDates = new Set(draft.slots.map((key) => key.slice(0, 10)));
  const pickedTotal = draft.slots.length + draft.customTimes.length;

  const canNext = (() => {
    if (step === 'name') return draft.name.trim() !== '';
    if (step === 'slot') return pickedForPending.length > 0;
    if (step === 'place') return draft.placeDecided || draft.place.trim() !== '';
    return true;
  })();

  function renderStep() {
    if (config === null) return null;

    if (step === 'name') {
      return (
        <>
          <h2 className="ask">先报个名号，我好知道在跟谁说话</h2>
          {prefilled && <p className="ask-hint">上次填的帮你带过来了，改一下就行。</p>}
          <input
            className="input input-lg"
            value={draft.name}
            maxLength={20}
            placeholder="写个名字，方便我找到你"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canNext) next();
            }}
          />
        </>
      );
    }

    if (step === 'date') {
      return (
        <>
          <h2 className="ask">想约哪天？</h2>
          <p className="ask-hint">点一天就继续。带绿勾的是你已经选过时段的。</p>
          <Calendar
            config={config}
            selected={pendingDate}
            marked={markedDates}
            onPick={(date) => {
              setPendingDate(date);
              goto('slot');
            }}
          />
        </>
      );
    }

    if (step === 'slot') {
      const cells = pendingRow?.cells ?? [];
      const openCount = cells.filter((cell) => cell.blockReason === null).length;

      return (
        <>
          <h2 className="ask">{pendingRow?.label ?? ''}，哪个时段？</h2>

          {openCount === 0 ? (
            /*
              一个可选时段都没有时说清楚怎么办。
              以前这里只有「可以点着玩」，好友点完三个灰格子就卡住了 —— 下一步是灰的，
              唯一的出口是一行小链接，很容易被忽略。
            */
            <div className="notice notice-blocked">
              这天牛马<strong>全天在岗</strong>，一个时段都腾不出来。
              <br />
              {config.allowCustomTime ? '换一天，或者自己定一个时间。' : '回上一步换一天吧。'}
            </div>
          ) : (
            <p className="ask-hint">点一下选中，再点一下取消。灰的别点了，那是牛马在搬砖。</p>
          )}

          <div className="slot-cards">
            {cells.map((cell, index) => {
              const slot = config.slots.find((item) => item.key === cell.slot);
              if (slot === undefined) return null;

              const moodText =
                cell.mood === 'hot'
                  ? copies.hotCopy
                  : cell.mood === 'cold'
                    ? copies.coldCopy
                    : null;
              const picked = draft.slots.includes(slotKey(cell.date, cell.slot));

              const className = [
                'slot-card',
                picked ? 'slot-card-on' : '',
                cell.blockReason === 'work' ? 'slot-card-frozen' : '',
                cell.blockReason === 'display' ? 'slot-card-display' : '',
              ]
                .filter((part) => part !== '')
                .join(' ');

              return (
                <button
                  key={cell.slot}
                  type="button"
                  className={className}
                  // 一张一张弹出来，95ms 的间隔才看得出是「依次」
                  style={{ animationDelay: `${index * 95}ms` }}
                  title={
                    cell.blockReason === 'display'
                      ? '这个时段只放出来看看，牛马起不来'
                      : cell.blockReason === 'work'
                        ? '这会儿牛马在上班，选不了'
                        : '点一下选中 / 取消'
                  }
                  onClick={(event) => {
                    if (cell.blockReason === 'display') {
                      setMorningOpen(true);
                      return;
                    }
                    if (cell.blockReason === 'work') {
                      // 必须在事件里先把元素取出来：函数式更新是稍后才跑的，
                      // 那时 event.currentTarget 已经被浏览器清成 null 了
                      const anchor = event.currentTarget;
                      setTip((current) =>
                        current !== null && current.cell.date === cell.date && current.cell.slot === cell.slot
                          ? null
                          : { cell, slot, anchor },
                      );
                      return;
                    }
                    toggleSlot(cell, slot);
                  }}
                >
                  <span className="slot-card-head">
                    <span className="slot-card-name">{slot.label}</span>
                    <span className="slot-card-range">
                      {slot.start}–{slot.end}
                    </span>
                  </span>

                  {cell.mood !== null && cell.blockReason !== 'display' && <Puppet mood={cell.mood} />}
                  {moodText !== null && cell.blockReason !== 'display' && (
                    <span className="slot-card-mood">{moodText}</span>
                  )}

                  {cell.blockReason === 'display' && (
                    <span className="slot-card-badge">😴 起不来，仅供观赏</span>
                  )}
                  {cell.blockReason === 'work' && (
                    <span className="slot-card-badge">
                      <NiumaMark size={13} className="inline-mark" />
                      牛马在上班
                    </span>
                  )}
                  {cell.blockReason === null && (
                    <span className="slot-card-badge">
                      {picked ? '✓ 已选，再点取消' : '✨ 点我选上'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {config.allowCustomTime && (
            <div className="row-center">
              <button
                type="button"
                className={openCount === 0 ? 'btn btn-primary btn-big' : 'btn btn-link'}
                title="时段都不合适的话，时间和安排都可以自己写"
                onClick={() => goto('custom')}
              >
                {openCount === 0 ? '自己定一个时间 →' : '这几个都不合适？自己定一个时间 →'}
              </button>
            </div>
          )}
        </>
      );
    }

    if (step === 'custom') {
      return (
        <>
          <h2 className="ask">自己定一个时间</h2>
          <p className="ask-hint">
            日期已经选好了：<strong>{pendingRow?.label ?? shortDate(pendingDate)}</strong>。
            你只要说几点、想干嘛。
          </p>

          <datalist id="time-hints">
            {TIME_HINTS.map((hint) => (
              <option key={hint} value={hint} />
            ))}
          </datalist>

          <label className="field">
            <span>几点（可以敲，也可以点开挑）</span>
            <input
              className="input input-lg"
              list="time-hints"
              value={customTime}
              maxLength={30}
              placeholder="比如：凌晨三点"
              onChange={(event) => setCustomTime(event.target.value)}
            />
          </label>

          <label className="field">
            <span>干嘛</span>
            <input
              className="input input-lg"
              value={customActivity}
              maxLength={30}
              placeholder="比如：去江边看日出"
              onChange={(event) => setCustomActivity(event.target.value)}
            />
          </label>

          <div className="row-center">
            <button
              type="button"
              className="btn btn-primary"
              title="把上面填的时间和安排加进申请"
              disabled={customTime.trim() === '' && customActivity.trim() === ''}
              onClick={() => {
                setDraft({
                  ...draft,
                  customTimes: [
                    ...draft.customTimes,
                    { date: pendingDate, text: composeCustomText(customTime, customActivity) },
                  ],
                });
                setCustomTime('');
                setCustomActivity('');
              }}
            >
              加上这条
            </button>
          </div>

          {draft.customTimes.length > 0 && (
            <ul className="custom-list">
              {draft.customTimes.map((item, index) => (
                <li key={`${item.date}|${index}`}>
                  <span>
                    {shortDate(item.date)} · {item.text}
                  </span>
                  <button
                    type="button"
                    className="btn btn-link"
                    title="删掉这条自定义时间"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        customTimes: draft.customTimes.filter((_, i) => i !== index),
                      })
                    }
                  >
                    删掉
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }

    if (step === 'place') {
      return (
        <>
          <h2 className="ask">在哪儿见？</h2>
      <p className="ask-hint">想不出来就丢给牛马，反正它也没主意。</p>
          <PlaceField
            config={config}
            value={draft.place}
            decided={draft.placeDecided}
            onChange={(value) => setDraft({ ...draft, place: value })}
            onDecide={() => setDraft({ ...draft, placeDecided: true })}
            onUndecide={() => setDraft({ ...draft, placeDecided: false })}
          />
        </>
      );
    }

    // 「见面要求」和「留言」都是一句话的自由文本，合成一页，省一步
    if (step === 'extras') {
      return (
        <>
          <h2 className="ask">最后两句，都可不填。</h2>

          <label className="field">
            <span>见面有什么小要求？</span>
            <input
              className="input input-lg"
              value={draft.meetingNote}
              maxLength={60}
              placeholder="比如：带一朵鲜花"
              onChange={(event) => setDraft({ ...draft, meetingNote: event.target.value })}
            />
          </label>

          <label className="field">
            <span>还有什么想说的？</span>
            <textarea
              className="input textarea"
              value={draft.message}
              maxLength={500}
              rows={3}
              placeholder="比如：别点太辣的"
              onChange={(event) => setDraft({ ...draft, message: event.target.value })}
            />
          </label>
        </>
      );
    }

    return (
      <>
        <h2 className="ask">看一眼，没问题我就交上去了</h2>
        <dl className="receipt-list">
          <div>
            <dt>申请人</dt>
            <dd>{resolvedName}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>
              {pickedTotal === 0
                ? '（还没选）'
                : [
                    ...draft.slots.map((key) => {
                      const [date = '', slot = ''] = key.split('|');
                      return { key, label: describeSelection(config, date, slot) };
                    }),
                    ...draft.customTimes.map((item, index) => ({
                      key: `custom-${index}`,
                      label: `${shortDate(item.date)} · ${item.text}`,
                    })),
                  ].map((entry) => (
                    <span key={entry.key} className="receipt-custom">
                      {entry.label}
                      <button
                        title="取消选中这个时段"
                        type="button"
                        className="btn btn-link"
                        onClick={() => {
                          if (entry.key.startsWith('custom-')) {
                            const index = Number(entry.key.slice(7));
                            setDraft({
                              ...draft,
                              customTimes: draft.customTimes.filter((_, i) => i !== index),
                            });
                          } else {
                            setDraft({ ...draft, slots: draft.slots.filter((item) => item !== entry.key) });
                          }
                        }}
                      >
                        删
                      </button>
                    </span>
                  ))}
            </dd>
          </div>
          <div>
            <dt>地点</dt>
            <dd>{draft.placeDecided ? config.place.decidedLabel : draft.place}</dd>
          </div>
          <div>
            <dt>见面要求</dt>
            <dd>{draft.meetingNote.trim() === '' ? '（没提）' : draft.meetingNote.trim()}</dd>
          </div>
          <div>
            <dt>留言</dt>
            <dd>{draft.message === '' ? '（没留）' : draft.message}</dd>
          </div>
        </dl>

        {config.allowMultipleSlots && (
          <div className="row-center">
            <button
              type="button"
              className="btn btn-ghost"
              title="回到日历，再挑一天加进来"
              onClick={() => goto('date')}
            >
              + 再加一个时间
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <main className="paper" data-theme={role.theme}>
      <header className="redhead">
        <p className="doc-number">{buildDocNumber()}</p>
        <h1 className="redhead-title">{role.label} · 约会申请表</h1>
      </header>
      <div className="rule" />

      <WizardProgress index={stepIndex} total={chain.length} />

      <div className="wizard-meta">
        <span>填一半关掉也不怕，给你存着了</span>
        {pickedTotal > 0 && <span className="wizard-picked">已选 {pickedTotal} 个时间</span>}
      </div>

      {/* key 换成 step：切一步就重新挂载，入场动画重新播一遍 */}
      <section className="wizard-body" key={step}>
        {renderStep()}
      </section>

      {error !== null && <p className="error-box">{error}</p>}

      <nav className="step-nav">
        {stepIndex > 0 || step === 'custom' ? (
          <button type="button" className="btn btn-ghost" title="回到上一步" onClick={back}>
            ← 上一步
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-link"
            title="回到身份选择页"
            onClick={() => navigate('/')}
          >
            返回换身份
          </button>
        )}

        {step === 'review' ? (
          <button
            type="button"
            className="btn btn-primary btn-big"
            title="交上去，之后在回执页等审批结果"
            disabled={busy || pickedTotal === 0}
            onClick={() => void submit()}
          >
            {busy ? '提交中…' : '提交申请'}
          </button>
        ) : step === 'date' ? (
          <span className="step-hint">点上面选一天就继续</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            title="进入下一步"
            disabled={!canNext}
            onClick={next}
          >
            下一步 →
          </button>
        )}
      </nav>

      {tip !== null && (
        <LockTip
          config={config}
          cell={tip.cell}
          slot={tip.slot}
          roleKey={role.key}
          anchor={tip.anchor}
        />
      )}

      {morningOpen && (
        <NoteModal
          stamp="特别提醒"
          text={fillCopy(copies.morning, resolvedName)}
          mood="cold"
          action="知道了，我看看别的"
          onClose={() => setMorningOpen(false)}
        />
      )}
    </main>
  );
}
