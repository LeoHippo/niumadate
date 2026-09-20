import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fillInviteName, findRole } from '@niumadate/shared';
import type { Invite, InviteMessage } from '@niumadate/shared';
import { api, describeError } from '../api';
import { NiumaMark } from '../components';
import { useConfig } from '../config-context';
import { rememberInvite } from '../lib';
import { Puppet } from '../puppet';
import type { PuppetMood } from '../puppet';
import '../invite-page.css';

/**
 * 好友点开邀请链接看到的页面。
 *
 * 这一页和填写页的处境**完全不同**：
 *   填写页天天用、要填一堆东西 → 克制、看得清
 *   邀请页一辈子看一两次     → **放开了做**：好看、记得住、想截图
 *
 * 所以这里不复用那四套"收着"的主题，而是另做四套**材质**：
 *   好兄弟 → 牛皮纸 + 酒渍 + 深红火漆
 *   好姐妹 → 珠光信笺 + 玫瑰金烫印
 *   好宝宝 → 奶油纸 + 云 + 糖果色
 *   DAD&MUM → 红头文件 + 钢印
 */

/** 拆信的节奏。靠 CSS 的 animation-delay 串，这里只负责放行到"可交互"。 */
const STAGE_SEAL = 1500; // 火漆落下
const STAGE_OPEN = 2700; // 信纸展开

export function InvitePage() {
  const config = useConfig();
  const params = useParams();
  const code = params.code ?? '';

  const [data, setData] = useState<{ invite: Invite; messages: InviteMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'seal' | 'open' | 'ready'>('seal');

  const load = useCallback(async () => {
    try {
      const result = await api.invite(code);
      setData(result);
      setError(null);
      // 记住之后，他能在「我的记录」里翻到这一份
      rememberInvite(code);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data === null) return;
    const openAt = window.setTimeout(() => setPhase('open'), STAGE_SEAL);
    const readyAt = window.setTimeout(() => setPhase('ready'), STAGE_OPEN);
    return () => {
      window.clearTimeout(openAt);
      window.clearTimeout(readyAt);
    };
  }, [data]);

  if (error !== null) {
    return (
      <main className="invite-page" data-theme="baby">
        <div className="invite-broken">
          <span className="invite-broken-emoji">📭</span>
          <p className="invite-broken-title">这份邀请打不开了</p>
          <p className="invite-broken-text">{error}</p>
          <p className="invite-broken-text">
            链接可能会过期，也可能是在微信里被截断了。让牛马重新发一份给你就行。
          </p>
        </div>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="invite-page" data-theme="baby">
        <p className="invite-loading">正在拆开……</p>
      </main>
    );
  }

  const { invite } = data;
  const role = findRole(config, invite.role);

  return (
    <main
      className={`invite-page invite-stage-${phase}`}
      data-theme={invite.role}
    >
      {/* 背景：光尘 + 材质底纹 */}
      <div className="invite-backdrop" aria-hidden="true">
        <span className="invite-mote invite-mote-1" />
        <span className="invite-mote invite-mote-2" />
        <span className="invite-mote invite-mote-3" />
        <span className="invite-mote invite-mote-4" />
        <span className="invite-mote invite-mote-5" />
      </div>

      {/* 火漆印章：落下来，蜡向四周溢开 */}
      <div className="invite-seal" aria-hidden="true">
        <span className="invite-seal-wax" />
        <span className="invite-seal-face">{role?.emoji ?? '🐮'}</span>
        <span className="invite-seal-rim" />
      </div>

      <div className="invite-letter">
        <header className="invite-head">
          <NiumaMark size={40} className="invite-mark" />
          {/* 标题用「墨迹书写」的观感出来：一层描边跑一遍 */}
          <h1 className="invite-title">{invite.title}</h1>
          <div className="invite-rule" />
        </header>

        <p className="invite-greeting">{fillInviteName(invite.greeting, invite.inviteeName)}</p>

        {/*
          **段落之间由小人过渡。**
          不靠淡入淡出，而是让一个小人在那儿干活：把下一段"拉出来"。
          这是整页的节奏感来源 —— 每一段都是被它拽出来的，不是自己冒出来的。
        */}
        <Holder gender={config.invite.hostGender} mode="pull" />

        {/* 时间 / 地点 / 干嘛 —— 一行比一行沉 */}
        <dl className="invite-facts">
          <div className="invite-fact">
            <dt>什么时候</dt>
            <dd className="invite-fact-key">
              {invite.date}
              {invite.timeText === '' ? '' : ` ${invite.timeText}`}
            </dd>
          </div>
          <div className="invite-fact">
            <dt>在哪儿</dt>
            <dd className="invite-fact-key">{invite.place || '（没写，到时候说）'}</dd>
          </div>
          <div className="invite-fact">
            <dt>干嘛</dt>
            <dd>{invite.activity || '（没写，去了就知道）'}</dd>
          </div>
        </dl>

        {invite.body.trim() !== '' && <p className="invite-body">{invite.body}</p>}

        <p className="invite-signature">{invite.signature}</p>

        <Answer
          invite={invite}
          hostGender={config.invite.hostGender}
          onAnswer={(status) => {
            void api
              .respondInvite(code, status)
              .then((result) =>
                setData((current) =>
                  current === null ? current : { invite: result.invite, messages: current.messages },
                ),
              )
              .catch((cause: unknown) => setError(describeError(cause)));
          }}
        />

        {/* 到对话区再推一把：该说话了 */}
        <Holder gender={config.invite.hostGender} mode="push" />

        <Chat
          code={code}
          messages={data.messages}
          onSent={(messages) =>
            setData((current) => (current === null ? current : { invite: current.invite, messages }))
          }
        />
      </div>
    </main>
  );
}

/**
 * 段落之间的小人。
 *
 * 不是装饰 —— 它是**过渡本身**：下一段是被它拽出来 / 推出来的，
 * 所以整页读起来有「有人在给你递东西」的节奏，而不是元素各显各的。
 *
 * 做到这个程度就够了：它只要在段落交界处露一下、动一下，
 * 眼睛就会把两段连起来。做得太重反而抢戏。
 */
function Holder({ gender, mode }: { gender: 'male' | 'female'; mode: 'pull' | 'push' }) {
  return (
    <div className={`holder holder-${mode}`} aria-hidden="true">
      <Puppet gender={gender} mood={mode === 'pull' ? 'reach' : 'grow'} />
      <span className="holder-line" />
    </div>
  );
}

/* ==========================================================================
   「不允许拒绝」的完整编排
   --------------------------------------------------------------------------
   这是整个功能最有记忆点的一段，所以按**分镜**写，不是随便飘一下：

     走 → 抓 → 举 → 团 → 扔 → 拉大 → 坐 → 指

   每一步都有自己的时长，用 setTimeout 串起来。
   位置靠 refs 量出来 —— 小人得真的站在那个按钮跟前，不能大概齐。
   ========================================================================== */

type Act = 'idle' | 'walk' | 'reach' | 'grab' | 'crumple' | 'throw' | 'grow' | 'sit' | 'point';

/** [这一步叫什么, 什么时候到这一步（毫秒）] */
const SCRIPT: ReadonlyArray<readonly [Act, number]> = [
  ['walk', 60],
  ['reach', 1150],
  ['grab', 1600],
  ['crumple', 2150],
  ['throw', 2700],
  ['grow', 3600],
  ['sit', 4350],
  ['point', 5150],
];

/** 到哪一步为止，小人该站在婉拒按钮那边。 */
const AT_NO_BUTTON: ReadonlySet<Act> = new Set<Act>(['walk', 'reach', 'grab', 'crumple', 'throw']);

function moodFor(act: Act): PuppetMood {
  switch (act) {
    case 'walk':
      return 'walk';
    case 'reach':
    case 'grab':
      return 'reach';
    case 'crumple':
    case 'throw':
      return 'throw';
    case 'grow':
      return 'grow';
    case 'sit':
      return 'sit';
    case 'point':
      return 'point';
    default:
      return 'idle';
  }
}

function Answer({
  invite,
  hostGender,
  onAnswer,
}: {
  invite: Invite;
  hostGender: 'male' | 'female';
  onAnswer: (status: 'accepted' | 'declined') => void;
}) {
  const [act, setAct] = useState<Act>('idle');
  const [pupX, setPupX] = useState(0);
  /**
   * 婉拒按钮是不是已经被扔掉了。
   *
   * 为什么要单独记一个：`crumpled` / `thrown` 这类 class 是**按当前这一步**挂的，
   * 走到下一步就没了 —— 于是按钮会**自己长回来**（实测截图里它又出现了）。
   * 扔出去就该没了，所以这个标记只进不退。
   */
  const [gone, setGone] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const noRef = useRef<HTMLButtonElement | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = (): void => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  // 组件走了就别让定时器还在跑
  useEffect(() => clearTimers, []);

  /** 量出「小人该站哪」—— 站在按钮正上方，脚尖对着按钮中线。 */
  const placeAt = useCallback((which: 'no' | 'yes') => {
    const stage = stageRef.current;
    const target = which === 'no' ? noRef.current : yesRef.current;
    if (stage === null || target === null) return;
    const s = stage.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    setPupX(t.left - s.left + t.width / 2 - 80);
  }, []);

  useLayoutEffect(() => {
    if (act === 'idle') return;
    placeAt(AT_NO_BUTTON.has(act) ? 'no' : 'yes');
  }, [act, placeAt]);

  const play = (): void => {
    clearTimers();
    for (const [step, at] of SCRIPT) {
      timers.current.push(window.setTimeout(() => setAct(step), at));
    }
    // 扔完之后就永久消失，不再长回来
    timers.current.push(window.setTimeout(() => setGone(true), 3400));
  };

  // ---------- 已经回应过了 ----------
  if (invite.status !== 'pending') {
    return (
      <div className="invite-answered">
        <span className="invite-answered-emoji">
          {invite.status === 'accepted' ? '🎉' : '😔'}
        </span>
        <p className="invite-answered-title">
          {invite.status === 'accepted' ? '好的，就这么定了' : '这次先不去了'}
        </p>
        <p className="invite-answered-hint">
          {invite.status === 'accepted'
            ? '到时候见。有事在这儿说一声，或者直接微信。'
            : '想改主意的话，点下面。'}
        </p>
        <button
          type="button"
          className="invite-btn invite-btn-ghost"
          onClick={() => onAnswer(invite.status === 'accepted' ? 'declined' : 'accepted')}
        >
          改成{invite.status === 'accepted' ? '「那天不行」' : '「好，我去」'}
        </button>
      </div>
    );
  }

  const crumpled = act === 'crumple' || act === 'throw';
  const seated = act === 'sit' || act === 'point';

  return (
    <div className="invite-answer">
      <div className="invite-stage" ref={stageRef}>
        {/*
          小人。**按钮还在，只是点不到** —— 看得见够不着才有戏，
          所以婉拒按钮不是藏起来，是被抓走扔掉了。
        */}
        {invite.noDecline && act !== 'idle' && (
          <div className="invite-puppet-holder" style={{ transform: `translateX(${pupX}px)` }}>
            <Puppet gender={hostGender} mood={moodFor(act)} />
          </div>
        )}

        <div className="invite-buttons">
          <button
            type="button"
            ref={noRef}
            className={[
              'invite-btn',
              'invite-btn-no',
              gone ? 'invite-btn-gone' : '',
              crumpled ? 'invite-btn-crumpled' : '',
              act === 'grab' ? 'invite-btn-lifted' : '',
              act === 'throw' ? 'invite-btn-thrown' : '',
            ]
              .filter((c) => c !== '')
              .join(' ')}
            onClick={() => {
              if (invite.noDecline) {
                // 點得到也不让它成事 —— 小人的戏就是这么来的
                play();
                return;
              }
              onAnswer('declined');
            }}
          >
            那天不行
          </button>

          <button
            type="button"
            ref={yesRef}
            className={`invite-btn invite-btn-yes ${seated ? 'invite-btn-seated' : ''}`}
            style={act === 'grow' || seated ? { transform: 'scale(1.28)' } : undefined}
            onClick={() => onAnswer('accepted')}
          >
            好，我去 →
          </button>
        </div>
      </div>

      {invite.noDecline && (
        <p className="invite-locked-hint">
          这份邀请<strong>不接受婉拒</strong> —— 小牛马已经把「那天不行」抓走扔了。
        </p>
      )}
    </div>
  );
}

/** 对话区。**这个功能的重点** —— 定下来之后还要来回商量。 */
function Chat({
  code,
  messages,
  onSent,
}: {
  code: string;
  messages: InviteMessage[];
  onSent: (messages: InviteMessage[]) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = listRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  const send = (): void => {
    if (text.trim() === '') return;
    setBusy(true);
    void api
      .sendInviteMessage(code, text)
      .then((result) => {
        onSent(result.messages);
        setText('');
        setError(null);
      })
      .catch((cause: unknown) => setError(describeError(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="invite-chat">
      <h2 className="invite-chat-title">说两句</h2>
      <p className="invite-chat-hint">
        几点到、要不要带伞、想吃什么 —— 都在这儿说，牛马看得到。
      </p>

      {messages.length > 0 && (
        <div className="invite-chat-list" ref={listRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.from === 'host'
                  ? 'invite-chat-msg invite-chat-host'
                  : 'invite-chat-msg invite-chat-guest'
              }
            >
              <span className="invite-chat-who">{message.from === 'host' ? '牛马' : '我'}</span>
              <span className="invite-chat-text">{message.text}</span>
            </div>
          ))}
        </div>
      )}

      {error !== null && <p className="invite-chat-error">{error}</p>}

      <form
        className="invite-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          className="invite-chat-input"
          value={text}
          placeholder="说点什么…"
          maxLength={800}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="submit"
          className="invite-btn invite-btn-send"
          disabled={busy || text.trim() === ''}
        >
          发送
        </button>
      </form>
    </section>
  );
}
