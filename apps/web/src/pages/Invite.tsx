import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fillInviteName, findRole } from '@niumadate/shared';
import type { Invite, InviteMessage } from '@niumadate/shared';
import { api, describeError } from '../api';
import { NiumaMark } from '../components';
import { useConfig } from '../config-context';
import { rememberInvite } from '../lib';
import { Puppet } from '../puppet';
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

/** 拆信的几个阶段。靠 CSS 的 animation-delay 串起来，不需要 JS 定时器。 */
const STAGE_SEAL = 1400; // 火漆落下
const STAGE_OPEN = 2600; // 信纸展开

export function InvitePage() {
  const config = useConfig();
  const params = useParams();
  const code = params.code ?? '';

  const [data, setData] = useState<{ invite: Invite; messages: InviteMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'seal' | 'open' | 'ready'>('seal');

  const load = useCallback(async () => {
    try {
      const result = await api.invite(code);
      setData(result);
      setError(null);
      // 记住了之后，他能在「我的记录」里翻到这一份
      rememberInvite(code);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  // 拆信的节奏。写在 JS 里而不是纯 CSS：加载失败时要能立刻跳过动画看错误。
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
      data-nostamp={invite.noDecline ? 'no' : 'yes'}
    >
      {/* 火漆印章：落下来，蜡向四周溢开 */}
      <div className="invite-seal" aria-hidden="true">
        <span className="invite-seal-wax" />
        <span className="invite-seal-face">{role?.emoji ?? '🐮'}</span>
      </div>

      <div className="invite-letter">
        <header className="invite-head">
          <NiumaMark size={40} className="invite-mark" />
          <h1 className="invite-title">{invite.title}</h1>
          <div className="invite-rule" />
        </header>

        <p className="invite-greeting">{fillInviteName(invite.greeting, invite.inviteeName)}</p>

        {/* 时间 / 地点 / 干嘛 —— 三行，一行比一行沉 */}
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

        {invite.body.trim() !== '' && (
          <p className="invite-body">{invite.body}</p>
        )}

        <p className="invite-signature">{invite.signature}</p>

        <Answer
          invite={invite}
          hostGender={config.invite.hostGender}
          busy={busy}
          onAnswer={(status) => {
            setBusy(true);
            void api
              .respondInvite(code, status)
              .then((result) => setData({ invite: result.invite, messages: data.messages }))
              .catch((cause: unknown) => setError(describeError(cause)))
              .finally(() => setBusy(false));
          }}
        />

        <Chat
          code={code}
          messages={data.messages}
          onSent={(messages) => setData({ invite: data.invite, messages })}
        />
      </div>
    </main>
  );
}

/**
 * 两个按钮。
 *
 * 接受**大而突出**，婉拒**明显小一号** —— 这是刻意的，
 * 不是排版偷懒：这是"邀请"，气氛上就该是「来嘛」。
 */
function Answer({
  invite,
  hostGender,
  busy,
  onAnswer,
}: {
  invite: Invite;
  hostGender: 'male' | 'female';
  busy: boolean;
  onAnswer: (status: 'accepted' | 'declined') => void;
}) {
  const [thrown, setThrown] = useState(false);
  const declinedRef = useRef<HTMLButtonElement | null>(null);

  // 已经回应过了：给个「改主意」的入口，别把人锁死
  if (invite.status !== 'pending') {
    return (
      <div className="invite-answered">
        <p className="invite-answered-title">
          {invite.status === 'accepted' ? '好的，就这么定了 ✓' : '这次先不去了'}
        </p>
        <p className="invite-answered-hint">
          {invite.status === 'accepted'
            ? '到时候见。有事在这儿说一声，或者直接微信。'
            : '想改的话点下面。'}
        </p>
        <button
          type="button"
          className="invite-btn invite-btn-ghost"
          disabled={busy}
          onClick={() => onAnswer(invite.status === 'accepted' ? 'declined' : 'accepted')}
        >
          改成{invite.status === 'accepted' ? '「那天不行」' : '「好，我去」'}
        </button>
      </div>
    );
  }

  return (
    <div className={`invite-answer ${invite.noDecline ? 'invite-answer-locked' : ''}`}>
      {/*
        「不允许拒绝」：一个小人从屏幕右边走进来，把婉拒按钮抓走团成团扔了，
        再把接受按钮拉大，坐在上面指着「同意」。
        按钮**还在**（不是藏起来），只是点不到 —— 看得见够不着才有戏。
      */}
      {invite.noDecline && (
        <div className="invite-puppet-stage" aria-hidden="true">
          <Puppet gender={hostGender} mood={thrown ? 'sit' : 'walk'} />
        </div>
      )}

      <div className="invite-buttons">
        <button
          type="button"
          ref={declinedRef}
          className={`invite-btn invite-btn-no ${thrown ? 'invite-btn-thrown' : ''}`}
          disabled={busy}
          onClick={() => {
            if (invite.noDecline) {
              // 点得到也不让它成事 —— 小人的戏就是这么来的
              setThrown(true);
              window.setTimeout(() => setThrown(false), 3600);
              return;
            }
            onAnswer('declined');
          }}
        >
          那天不行
        </button>

        <button
          type="button"
          className="invite-btn invite-btn-yes"
          disabled={busy}
          onClick={() => onAnswer('accepted')}
        >
          好，我去 →
        </button>
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
        <button type="submit" className="invite-btn invite-btn-send" disabled={busy || text.trim() === ''}>
          发送
        </button>
      </form>
    </section>
  );
}
