import { useCallback, useEffect, useRef, useState } from 'react';
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
import '../invite-flow.css';
import '../invite-motion.css';

/**
 * 好友点开邀请链接看到的页面。
 *
 * **一页一页推进，不是一封信一次性展开。**
 *
 * 这两种做法差别很大：
 *   一次性展开 → 「哇，好看」      （观赏）
 *   一页一页   → 「然后呢？」      （**期待**）
 *
 * 用户要的是后者：有点神秘、有点被吊着、想看下一屏写的是什么。
 * 所以每屏只讲一件事，中间由小人做过渡，节奏交给他自己的手指。
 *
 * 但**不能把人关在流程里** —— 赶时间的人点「看全部」就能一次看完（那一版是信纸长卷）。
 *
 * 视觉上刻意不复用填写页那四套皮：填写页天天用要克制，
 * 这页一辈子看一两次，所以放开了做 —— 四套**材质**：
 *   好兄弟 牛皮纸+酒渍+深红火漆 / 好姐妹 珠光信笺+玫瑰金
 *   好宝宝 奶油纸+云+糖果色     / DAD&MUM 红头文件+钢印
 */

type Screen = 'seal' | 'who' | 'when' | 'where' | 'what' | 'word' | 'answer' | 'chat';

const SCREENS: readonly Screen[] = ['seal', 'who', 'when', 'where', 'what', 'word', 'answer', 'chat'];

/** 屏与屏之间的三种过渡 —— 轮着来，别每次都一样。 */
const MOVES = ['pull', 'fly', 'press'] as const;
type Move = (typeof MOVES)[number];

const MOVE_MOOD: Record<Move, PuppetMood> = { pull: 'pull', fly: 'fly', press: 'press' };

/** 过渡要放多久。太短看不见，太长让人等。 */
const MOVE_MS = 640;

export function InvitePage() {
  const config = useConfig();
  const params = useParams();
  const code = params.code ?? '';

  const [data, setData] = useState<{ invite: Invite; messages: InviteMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  /** 赶时间的人：一键摊开看全部。 */
  const [showAll, setShowAll] = useState(false);
  /**
   * 正在进行的过渡。
   *
   * 关键是**当前这一屏自己要走**：小人蹦出来把整屏拉走 / 推走，
   * 而不是淡出、也不是只让旁边的小人动一下 ——
   * 「页面被它拖走了」这个感觉，才是这个过渡的全部意义。
   */
  const [leaving, setLeaving] = useState<Move | null>(null);
  /** 刚过去的那一下是什么动作 —— 决定**新进来的这一屏从哪边滑进来**。 */
  const [enterFrom, setEnterFrom] = useState<Move | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.invite(code);
      setData(result);
      setError(null);
      rememberInvite(code);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 前进：先让**当前这一屏**被小人拉走 / 推走，再换下一屏。
   *
   * 方向是「从哪边出去」：拉 = 往左拖出去，推 = 往右推出去，飞 = 往右上拽走。
   * 下一屏从**相反方向**滑进来，接得严丝合缝 —— 观感上就是
   * 「小人把上面那张拖走，下面这张跟着补上来」。
   */
  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= SCREENS.length) return;
    const picked = MOVES[next % MOVES.length] ?? 'pull';
    setLeaving(picked);
    window.setTimeout(() => {
      setIndex(next);
      setLeaving(null);
      // 新的一屏从**相反方向**补上来，接得上「被拖走」那个动作
      setEnterFrom(picked);
    }, MOVE_MS);
  }, []);

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
  const screen = SCREENS[index] ?? 'seal';
  const last = index === SCREENS.length - 1;

  return (
    <main className="invite-page" data-theme={invite.role}>
      {/* 背景：材质底纹 + 光尘 */}
      <div className="invite-backdrop" aria-hidden="true">
        <span className="invite-mote invite-mote-1" />
        <span className="invite-mote invite-mote-2" />
        <span className="invite-mote invite-mote-3" />
        <span className="invite-mote invite-mote-4" />
        <span className="invite-mote invite-mote-5" />
      </div>

      {/*
        「揉成团」用的滤镜。
        CSS 只能缩放旋转，做不出纸被揉皱的**不规则褶皱** ——
        所以用 feTurbulence 生成噪声 + feDisplacementMap 把像素推开，
        按钮一皱，那一"团"就真的有纸感了。
      */}
      <svg className="defs-only" aria-hidden="true" focusable="false">
        <filter id="niuma-crumple">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {showAll ? (
        /* ---------- 赶时间：一次看完 ---------- */
        <LetterAll
          invite={invite}
          roleEmoji={role?.emoji ?? '🐮'}
          hostGender={config.invite.hostGender}
          messages={data.messages}
          onMessages={(messages) =>
            setData((current) => (current === null ? current : { invite: current.invite, messages }))
          }
          onRespond={(status) => {
            void api
              .respondInvite(code, status)
              .then((result) =>
                setData((current) =>
                  current === null ? current : { invite: result.invite, messages: current.messages },
                ),
              )
              .catch((cause: unknown) => setError(describeError(cause)));
          }}
          onBack={() => setShowAll(false)}
        />
      ) : (
        <>
          {/* ---------- 一屏 ---------- */}
          <section
            className={`screen screen-${screen}`}
            key={screen}
            onClick={() => {
              // 只在前面的「叙述屏」上点哪都能继续；按钮屏和对话屏不许误触
              if (screen !== 'answer' && !last) goTo(index + 1);
            }}
          >
            <div
              className={[
                'screen-inner',
                leaving === null ? '' : `card-leaving card-leaving-${leaving}`,
                leaving === null && enterFrom !== null ? `card-entering card-entering-${enterFrom}` : '',
              ]
                .filter((item) => item !== '')
                .join(' ')}
            >
              <ScreenBody
                screen={screen}
                invite={invite}
                roleEmoji={role?.emoji ?? '🐮'}
                hostGender={config.invite.hostGender}
                messages={data.messages}
                onRespond={(status) => {
                  void api
                    .respondInvite(code, status)
                    .then((result) => {
                      setData((current) =>
                        current === null
                          ? current
                          : { invite: result.invite, messages: current.messages },
                      );
                      // 回应完自动进对话 —— 定下来之后就该商量了
                      goTo(SCREENS.indexOf('chat'));
                    })
                    .catch((cause: unknown) => setError(describeError(cause)));
                }}
                onMessages={(messages) =>
                  setData((current) =>
                    current === null ? current : { invite: current.invite, messages },
                  )
                }
              />
            </div>
          </section>

          {/* ---------- 底部：进度 + 继续 + 看全部 ---------- */}
          <footer className="screen-bar">
            <div className="screen-dots" aria-hidden="true">
              {SCREENS.map((item, i) => (
                <span key={item} className={i <= index ? 'dot dot-on' : 'dot'} />
              ))}
            </div>

            <div className="screen-bar-row">
              <button
                type="button"
                className="btn btn-ghost screen-skip"
                title="不想一页页看，直接摊开"
                onClick={() => setShowAll(true)}
              >
                看全部
              </button>

              {!last && screen !== 'answer' && (
                <button
                  type="button"
                  className="btn btn-primary screen-next"
                  title="看下一屏"
                  onClick={() => goTo(index + 1)}
                >
                  轻点继续 →
                </button>
              )}
            </div>
          </footer>

          {/*
            ---------- 屏与屏之间：小人把整屏拖走 ----------

            它**不是**在旁边演一段动画，而是**真的抓着这一屏**：
            蹦到屏幕边 → 抓住 → 使劲把它拖出去。
            所以它得贴在页面上、跟着那一屏一起走，而不是飘在一层遮罩上。
          */}
          {leaving !== null && (
            <div className={`puller puller-${leaving}`} aria-hidden="true">
              <Puppet gender={config.invite.hostGender} mood={MOVE_MOOD[leaving]} />
            </div>
          )}
        </>
      )}
    </main>
  );
}

/* ==========================================================================
   每一屏的内容。一屏只讲一件事 —— 这是整页节奏的根基。
   ========================================================================== */

function ScreenBody({
  screen,
  invite,
  roleEmoji,
  hostGender,
  messages,
  onRespond,
  onMessages,
}: {
  screen: Screen;
  invite: Invite;
  roleEmoji: string;
  hostGender: 'male' | 'female';
  messages: InviteMessage[];
  onRespond: (status: 'accepted' | 'declined') => void;
  onMessages: (messages: InviteMessage[]) => void;
}) {
  switch (screen) {
    case 'seal':
      return (
        <>
          <div className="invite-seal" aria-hidden="true">
            <span className="invite-seal-wax" />
            <span className="invite-seal-face">{roleEmoji}</span>
            <span className="invite-seal-rim" />
          </div>
          <p className="screen-kicker">有一封邀请</p>
          <h1 className="screen-question">拆开看看？</h1>
        </>
      );

    case 'who':
      return (
        <>
          <span className="screen-emoji">{roleEmoji}</span>
          <p className="screen-kicker">这一封是给你的</p>
          <p className="screen-hand">{fillInviteName(invite.greeting, invite.inviteeName)}</p>
        </>
      );

    case 'when':
      return (
        <>
          <span className="screen-emoji">🗓️</span>
          <p className="screen-kicker">先把日子定下来</p>
          <p className="screen-big">{invite.date}</p>
          {invite.timeText !== '' && <p className="screen-hand">{invite.timeText}</p>}
        </>
      );

    case 'where':
      return (
        <>
          <span className="screen-emoji">📍</span>
          <p className="screen-kicker">在哪儿见</p>
          <p className="screen-big">{invite.place || '（没写，到时候说）'}</p>
        </>
      );

    case 'what':
      return (
        <>
          <span className="screen-emoji">🎯</span>
          <p className="screen-kicker">干嘛去</p>
          <p className="screen-big">{invite.activity || '（没写，去了就知道）'}</p>
        </>
      );

    case 'word':
      return (
        <>
          <p className="screen-kicker">还有几句话</p>
          {invite.body.trim() !== '' && <p className="screen-body">{invite.body}</p>}
          <p className="screen-sign">{invite.signature}</p>
          <p className="screen-kicker">—— {invite.title}</p>
        </>
      );

    case 'answer':
      return (
        <>
          <p className="screen-kicker">所以，去不去？</p>
          <Answer
            invite={invite}
            hostGender={hostGender}
            onAnswer={onRespond}
          />
        </>
      );

    case 'chat':
    default:
      return (
        <Chat
          code={invite.code}
          messages={messages}
          onSent={onMessages}
        />
      );
  }
}

/* ==========================================================================
   「不允许拒绝」的完整编排：走 → 抓 → 举 → 团 → 扔 → 拉大 → 坐 → 指
   ========================================================================== */

type Act = 'idle' | 'walk' | 'reach' | 'grab' | 'crumple' | 'throw' | 'grow' | 'sit' | 'point';

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
   * 为什么要单独记：`crumpled`/`thrown` 是按**当前这一步**挂的，
   * 走到下一步就没了 —— 按钮会自己长回来（实测真出现过）。扔出去就得永久消失。
   */
  const [gone, setGone] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const noRef = useRef<HTMLButtonElement | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = (): void => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const placeAt = useCallback((which: 'no' | 'yes') => {
    const stage = stageRef.current;
    const target = which === 'no' ? noRef.current : yesRef.current;
    if (stage === null || target === null) return;
    const s = stage.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    setPupX(t.left - s.left + t.width / 2 - 80);
  }, []);

  useEffect(() => {
    if (act === 'idle') return;
    placeAt(AT_NO_BUTTON.has(act) ? 'no' : 'yes');
  }, [act, placeAt]);

  const play = (): void => {
    clearTimers();
    for (const [step, at] of SCRIPT) {
      timers.current.push(window.setTimeout(() => setAct(step), at));
    }
    timers.current.push(window.setTimeout(() => setGone(true), 3400));
  };

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
          {invite.status === 'accepted' ? '到时候见。' : '想改主意的话，点下面。'}
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
              .filter((item) => item !== '')
              .join(' ')}
            onClick={() => {
              if (invite.noDecline) {
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

/* ==========================================================================
   看全部：信纸长卷（就是原来那一版，留给赶时间的人）
   ========================================================================== */

function LetterAll({
  invite,
  roleEmoji,
  hostGender,
  messages,
  onRespond,
  onMessages,
  onBack,
}: {
  invite: Invite;
  roleEmoji: string;
  hostGender: 'male' | 'female';
  messages: InviteMessage[];
  onRespond: (status: 'accepted' | 'declined') => void;
  onMessages: (messages: InviteMessage[]) => void;
  onBack: () => void;
}) {
  return (
    <div className="invite-all">
      <div className="invite-seal" aria-hidden="true">
        <span className="invite-seal-wax" />
        <span className="invite-seal-face">{roleEmoji}</span>
        <span className="invite-seal-rim" />
      </div>

      <div className="invite-letter">
        <header className="invite-head">
          <NiumaMark size={40} className="invite-mark" />
          <h1 className="invite-title">{invite.title}</h1>
          <div className="invite-rule" />
        </header>

        <p className="invite-greeting">{fillInviteName(invite.greeting, invite.inviteeName)}</p>

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

        <Answer invite={invite} hostGender={hostGender} onAnswer={onRespond} />
        <Chat code={invite.code} messages={messages} onSent={onMessages} />

        <nav className="step-nav">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← 回到一页一页看
          </button>
        </nav>
      </div>
    </div>
  );
}
