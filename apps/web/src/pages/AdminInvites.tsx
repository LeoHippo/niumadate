import { useCallback, useEffect, useState } from 'react';
import { findRole, invitePresetFor } from '@niumadate/shared';
import type { AppConfig, CreateInviteInput, Invite, InviteMessage, RoleKey } from '@niumadate/shared';
import { api, describeError } from '../api';
import { Puppet } from '../puppet';
import '../invite-admin.css';
import '../host-pick.css';

/**
 * 后台的「邀请」面板。
 *
 * 和「申请」是两条独立的线：申请是好友发起、牛马审批；
 * 邀请是牛马发起、好友接受或婉拒，**之后两边能来回留言**。
 * 最后那条是重点 —— 定下来之后还要商量「几点到」「要不要带伞」，
 * 所以对话区不是附加功能，是主体。
 */

interface Draft extends CreateInviteInput {
  /** 正在编辑已有的那条时，这里是它的 id；新建时是 null。 */
  id: string | null;
}

function emptyDraft(config: AppConfig | null, role: RoleKey): Draft {
  const preset = invitePresetFor(role);
  return {
    id: null,
    role,
    inviteeName: '',
    date: '',
    timeText: '',
    place: '',
    activity: '',
    noDecline: config?.invite.defaultNoDecline ?? false,
    ...preset,
  };
}

function draftFrom(invite: Invite): Draft {
  return {
    id: invite.id,
    role: invite.role,
    inviteeName: invite.inviteeName,
    date: invite.date,
    timeText: invite.timeText,
    place: invite.place,
    activity: invite.activity,
    noDecline: invite.noDecline,
    title: invite.title,
    greeting: invite.greeting,
    body: invite.body,
    signature: invite.signature,
  };
}

const STATUS_TEXT: Record<Invite['status'], string> = {
  pending: '待回应',
  accepted: '已接受',
  declined: '已婉拒',
};

/** 把 `{name}` 换成人名，好让牛马在后台就看到好友会看到什么。 */
function preview(template: string, name: string): string {
  return template.replaceAll('{name}', name.trim() === '' ? '朋友' : name.trim());
}

export function InvitesPanel({ config }: { config: AppConfig | null }) {
  const [items, setItems] = useState<Invite[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [chat, setChat] = useState<{ invite: Invite; messages: InviteMessage[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [base, setBase] = useState('');
  /**
   * 小人的性别**单独存一份本地状态**。
   *
   * 为什么不直接用 config.invite.hostGender：config 是外层 Admin 加载后传进来的那份，
   * 保存之后外层并不会重新拉一遍 —— 于是"点了女版但界面不动"（实测踩过）。
   * 本地存一份，点完立刻反映，也顺便当乐观更新。
   */
  const [gender, setGender] = useState<'male' | 'female'>('male');
  /** 邀请人写谁 —— 和性别一样，本地存一份，保存后立刻反映。 */
  const [hostName, setHostName] = useState('牛马');

  const load = useCallback(async () => {
    try {
      const result = await api.admin.listInvites();
      setItems(result.items);
      setError(null);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setBase(config?.invite.publicBase ?? '');
  }, [config?.invite.publicBase]);

  useEffect(() => {
    setGender(config?.invite.hostGender ?? 'male');
  }, [config?.invite.hostGender]);

  useEffect(() => {
    setHostName(config?.invite.hostName ?? '牛马');
  }, [config?.invite.hostName]);

  /** 一键提示，两秒后自己消失。 */
  const say = (text: string): void => {
    setFlash(text);
    window.setTimeout(() => setFlash(null), 2200);
  };

  /** 拼给好友的那条链接。配了公网地址就用它，否则给本机的（自己调试用）。 */
  const linkFor = (invite: Invite): string => {
    const origin = base.trim() === '' ? window.location.origin : base.trim().replace(/\/+$/, '');
    return `${origin}/i/${invite.code}`;
  };

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      say('链接已复制 ✓');
    } catch {
      // 剪贴板 API 在某些环境（非安全上下文、权限被拒）会失败，
      // 退回到「选中让用户自己按 Ctrl+C」——总比什么都不做好。
      window.prompt('复制下面这条链接：', text);
    }
  };

  const save = async (): Promise<void> => {
    if (draft === null) return;
    setBusy(true);
    setError(null);
    try {
      const payload: CreateInviteInput = {
        role: draft.role,
        inviteeName: draft.inviteeName,
        date: draft.date,
        timeText: draft.timeText,
        place: draft.place,
        activity: draft.activity,
        noDecline: draft.noDecline,
        title: draft.title,
        greeting: draft.greeting,
        body: draft.body,
        signature: draft.signature,
      };
      if (draft.id === null) {
        const created = await api.admin.createInvite(payload);
        setDraft(null);
        say('创建好了 ✓');
        void load();
        void copy(linkFor(created.invite));
      } else {
        await api.admin.updateInvite(draft.id, payload);
        setDraft(null);
        say('改好了 ✓');
        void load();
      }
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  };

  const openChat = async (invite: Invite): Promise<void> => {
    try {
      const result = await api.admin.inviteMessages(invite.id);
      setChat({ invite, messages: result.messages });
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  const sendChat = async (text: string): Promise<void> => {
    if (chat === null || text.trim() === '') return;
    try {
      const result = await api.admin.sendInviteMessage(chat.invite.id, text);
      setChat({ invite: chat.invite, messages: result.messages });
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    hint?: string,
  ) => (
    <label className="invite-field">
      <span className="invite-field-label">{label}</span>
      <input
        className="invite-input"
        value={value}
        placeholder={hint}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );

  return (
    <div className="invite-panel">
      {/*
        ---------- 邀请页上的小人 ----------

        做成**并排两个、点谁选谁**，而不是一个下拉框 ——
        因为"男的女的长什么样"正是这个设置要传达的信息，
        光写"男/女"两个字，用户根本不知道自己在选什么（之前就是这样）。
        所以直接把两个小人画出来给他看。
      */}
      <section className="host-pick">
        <div className="host-pick-head">
          <span className="host-pick-title">邀请页上的小人</span>
          <span className="host-pick-hint">
            它代表你本人，所以全局一个 —— 四套材质只是给它换装
          </span>
        </div>

        {/*
          「邀请人」—— 请柬上「人物」那一栏。
          不填就用「牛马」（站点人设名）；填了就是「张三 敬邀」。
          一张请柬不写邀请人是谁，收到的人会不知道在跟谁打交道。
        */}
        <label className="host-name-field">
          <span className="invite-field-label">
            邀请人写谁（留空就是「牛马」）—— 这是请柬上「邀请」那一栏
          </span>
          <input
            className="invite-input"
            value={hostName}
            placeholder="牛马"
            maxLength={20}
            onChange={(event) => setHostName(event.target.value)}
            onBlur={() => {
              const next = hostName.trim() === '' ? '牛马' : hostName.trim();
              setHostName(next);
              if (config !== null && next !== config.invite.hostName) {
                void api.admin
                  .saveConfig({ ...config, invite: { ...config.invite, hostName: next } })
                  .then(() => say('邀请人改好了 ✓'))
                  .catch((cause: unknown) => setError(describeError(cause)));
              }
            }}
          />
        </label>

        <div className="host-pick-row">
          {(['male', 'female'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={gender === option ? 'host-option host-option-on' : 'host-option'}
              title={option === 'male' ? '换成男版' : '换成女版'}
              onClick={() => {
                if (config === null || gender === option) return;
                // 先动界面，再发请求 —— 点一下就该立刻看到反馈
                setGender(option);
                void api.admin
                  .saveConfig({ ...config, invite: { ...config.invite, hostGender: option } })
                  .then(() => say(option === 'male' ? '小人换成男版了 ✓' : '小人换成女版了 ✓'))
                  .catch((cause: unknown) => {
                    setGender(gender);
                    setError(describeError(cause));
                  });
              }}
            >
              <Puppet gender={option} mood="idle" />
              <span className="host-option-label">
                {option === 'male' ? '男 · 犄角 + 领巾' : '女 · 蝴蝶结 + 围裙'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- 工具条 ---------- */}
      <div className="invite-toolbar">
        <label className="invite-field invite-field-grow">
          <span className="invite-field-label">
            公网地址（复制链接要用它；后台只在本机能开，地址栏里是 127.0.0.1，不能直接发给好友）
          </span>
          <input
            className="invite-input"
            value={base}
            placeholder="https://niumadate.xyz"
            onChange={(event) => setBase(event.target.value)}
            onBlur={() => {
              if (config !== null && base.trim() !== config.invite.publicBase) {
                void api.admin
                  .saveConfig({ ...config, invite: { ...config.invite, publicBase: base.trim() } })
                  .then(() => say('公网地址已保存 ✓'))
                  .catch((cause: unknown) => setError(describeError(cause)));
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          title="新建一份邀请"
          onClick={() => setDraft(emptyDraft(config, 'brother'))}
        >
          + 新建邀请
        </button>
      </div>

      {flash !== null && <p className="invite-flash">{flash}</p>}
      {error !== null && <p className="invite-error">{error}</p>}

      {/* ---------- 编辑器 ---------- */}
      {draft !== null && (
        <section className="invite-editor">
          <h3 className="invite-editor-title">{draft.id === null ? '新建邀请' : '编辑邀请'}</h3>

          <div className="invite-roles">
            {config?.roles.map((role) => (
              <button
                key={role.key}
                type="button"
                data-theme={role.theme}
                className={draft.role === role.key ? 'tab tab-on' : 'tab'}
                title={`换成「${role.label}」那套皮和文案`}
                onClick={() =>
                  setDraft((current) =>
                    current === null
                      ? current
                      : // 换身份顺手把文案也换成新身份的预设 —— 否则得手动重填一遍。
                        // 但已经手动改过的字段不该被冲掉，所以只在「还是旧预设」时才换。
                        {
                          ...current,
                          role: role.key,
                          ...invitePresetFor(role.key),
                        },
                  )
                }
              >
                {role.emoji} {role.label}
              </button>
            ))}
          </div>

          <div className="invite-grid">
            {field('邀请谁', draft.inviteeName, (v) => setDraft({ ...draft, inviteeName: v }), '留空 = 通用链接，谁点都能看')}
            <label className="invite-field">
              <span className="invite-field-label">日期</span>
              <input
                type="date"
                className="invite-input"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              />
            </label>
            {field('时间', draft.timeText, (v) => setDraft({ ...draft, timeText: v }), '随便写，比如「晚上七点半」')}
            {field('地点', draft.place, (v) => setDraft({ ...draft, place: v }), '楼下那家火锅')}
          </div>

          <label className="invite-field">
            <span className="invite-field-label">做什么</span>
            <input
              className="invite-input"
              value={draft.activity}
              placeholder="吃火锅，然后江边走走"
              onChange={(event) => setDraft({ ...draft, activity: event.target.value })}
            />
          </label>

          <p className="invite-section">邀请页上的话（默认已经按身份填好了，想改就改）</p>
          <div className="invite-grid">
            {field('标题', draft.title, (v) => setDraft({ ...draft, title: v }))}
            {field('开场白', draft.greeting, (v) => setDraft({ ...draft, greeting: v }), '{name} 会换成人名')}
          </div>
          <label className="invite-field">
            <span className="invite-field-label">正文（可以多行）</span>
            <textarea
              className="invite-input invite-textarea"
              rows={3}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          {field('落款', draft.signature, (v) => setDraft({ ...draft, signature: v }))}

          <label className="invite-check">
            <input
              type="checkbox"
              checked={draft.noDecline}
              onChange={(event) => setDraft({ ...draft, noDecline: event.target.checked })}
            />
            <span>
              不允许拒绝 —— 婉拒按钮还在，但点不到：小牛马会从屏幕右边走过来，
              一把把它抓走团成团扔了，再把接受按钮拉大坐上去
            </span>
          </label>

          {/* 让牛马先看一眼好友会看到什么 */}
          <div className="invite-preview">
            <p className="invite-preview-title">{draft.title || '（没标题）'}</p>
            <p>{preview(draft.greeting, draft.inviteeName) || '（没开场白）'}</p>
            <p className="invite-preview-key">
              {draft.date || '（没日期）'} {draft.timeText}
            </p>
            <p className="invite-preview-key">{draft.place || '（没地点）'}</p>
            <p>{draft.activity}</p>
          </div>

          <div className="invite-editor-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? '保存中…' : draft.id === null ? '创建并复制链接' : '保存'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
              取消
            </button>
          </div>
        </section>
      )}

      {/* ---------- 列表 ---------- */}
      {items === null ? (
        <p className="boot-title">正在读邀请……</p>
      ) : items.length === 0 ? (
        <p className="receipt-hint">还没有邀请。点右上角「+ 新建邀请」开一份。</p>
      ) : (
        <div className="invite-list">
          {items.map((invite) => {
            const role = findRole(config ?? { roles: [] } as unknown as AppConfig, invite.role);
            return (
              <div key={invite.id} className={`invite-row invite-row-${invite.status}`}>
                <div className="invite-row-main">
                  <span className="invite-row-name">
                    {role?.emoji} {invite.inviteeName.trim() === '' ? '（通用链接）' : invite.inviteeName}
                  </span>
                  <span className="invite-row-when">
                    {invite.date} {invite.timeText}
                  </span>
                  <span className="invite-row-place">{invite.place}</span>
                  <span className={`invite-badge invite-badge-${invite.status}`}>
                    {STATUS_TEXT[invite.status]}
                    {invite.noDecline && ' · 不许拒绝'}
                  </span>
                </div>
                <div className="invite-row-actions">
                  <button type="button" className="btn btn-link" onClick={() => void copy(linkFor(invite))}>
                    复制链接
                  </button>
                  <button type="button" className="btn btn-link" onClick={() => setDraft(draftFrom(invite))}>
                    编辑
                  </button>
                  <button type="button" className="btn btn-link" onClick={() => void openChat(invite)}>
                    对话
                  </button>
                  <button
                    type="button"
                    className="btn btn-link invite-danger"
                    onClick={() => {
                      if (!window.confirm(`删掉给「${invite.inviteeName || '通用'}」的这份邀请？留言也一起删。`)) return;
                      void api.admin
                        .removeInvite(invite.id)
                        .then(() => void load())
                        .catch((cause: unknown) => setError(describeError(cause)));
                    }}
                  >
                    删除
                  </button>
                </div>
                {chat !== null && chat.invite.id === invite.id && (
                  <ChatBox chat={chat} onSend={sendChat} onClose={() => setChat(null)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 对话区。**这个功能的重点** —— 定下来之后的来回商量都在这儿。 */
function ChatBox({
  chat,
  onSend,
  onClose,
}: {
  chat: { invite: Invite; messages: InviteMessage[] };
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');

  return (
    <div className="chat-box">
      <div className="chat-head">
        <span>和「{chat.invite.inviteeName.trim() === '' ? '好友' : chat.invite.inviteeName}」的对话</span>
        <button type="button" className="btn btn-link" onClick={onClose}>
          收起
        </button>
      </div>

      {chat.messages.length === 0 ? (
        <p className="chat-empty">还没有人说话。回一句「几点到、要不要带伞」这种。</p>
      ) : (
        <div className="chat-list">
          {chat.messages.map((message) => (
            <div key={message.id} className={`chat-msg chat-msg-${message.from}`}>
              <span className="chat-who">{message.from === 'host' ? '牛马' : '好友'}</span>
              <span className="chat-text">{message.text}</span>
              <span className="chat-time">{message.createdAt.slice(5, 16).replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      )}

      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSend(text).then(() => setText(''));
        }}
      >
        <input
          className="invite-input"
          value={text}
          placeholder="回一句…（Enter 发送）"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={text.trim() === ''}>
          发送
        </button>
      </form>
    </div>
  );
}
