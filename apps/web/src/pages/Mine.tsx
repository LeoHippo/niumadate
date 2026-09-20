import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findRole, isRoleKey } from '@niumadate/shared';
import type { Invite } from '@niumadate/shared';
import { api } from '../api';
import { NiumaMark } from '../components';
import { useConfig } from '../config-context';
import { describeSelection, openedInvites, shortDate, STATUS_LABELS } from '../lib';
import { useMySubmissions } from '../use-submission';

/**
 * 「我的记录」：这台设备提交过的申请 + 收到过的邀请。
 *
 * 为什么必须正面解释「为什么找不到」：
 * 两边都是**认浏览器**的，不是认账号的。好友换了浏览器、清了缓存、
 * 用了无痕模式，就会「明明有却找不到」。
 * 与其让他一脸懵，不如讲清原因，并且**先说那句最要紧的**：
 * 「你交过的申请、收到的邀请，牛马那边都留着」。
 * 好友最怕的不是麻烦，是以为没提交成功、或者数据丢了。
 */

/** 最多列这么多份，别让页面无限长。 */
const INVITE_SHOW_MAX = 12;

/** 把这台设备点开过的邀请捞出来。 */
function useOpenedInvites(): { invites: Invite[] | undefined } {
  const [invites, setInvites] = useState<Invite[] | undefined>(undefined);

  useEffect(() => {
    const codes = openedInvites().slice(0, INVITE_SHOW_MAX);
    if (codes.length === 0) {
      setInvites([]);
      return;
    }
    let alive = true;
    void (async () => {
      // 一份一份取。邀请是按码取的，没有"批量"接口 ——
      // 但也正因为如此，一份坏数据不会影响别的。
      const results = await Promise.all(
        codes.map(async (code) => {
          try {
            const result = await api.invite(code);
            return result.invite;
          } catch {
            // 被删了 / 码不对：跳过
            return null;
          }
        }),
      );
      if (alive) {
        setInvites(
          results
            .filter((item): item is Invite => item !== null)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { invites };
}

const INVITE_STATUS: Record<Invite['status'], string> = {
  pending: '还没回',
  accepted: '已接受',
  declined: '已婉拒',
};

export function MinePage() {
  const config = useConfig();
  const navigate = useNavigate();
  const { all, loading } = useMySubmissions();
  const { invites } = useOpenedInvites();

  const nothingSubmitted = !loading && (all === undefined || all.length === 0);
  const nothingInvited = invites !== undefined && invites.length === 0;
  const hasNothing = nothingSubmitted && nothingInvited;

  return (
    <main className="paper">
      <header className="redhead">
        <NiumaMark size={46} className="head-mark" />
        <p className="doc-number">{config.site.title}</p>
        <h1 className="redhead-title">我的记录</h1>
        <p className="redhead-sub">这台设备上提交过的、收到过的，都在这儿</p>
      </header>

      <div className="rule" />

      {/* ---------- 我提交的申请 ---------- */}
      <h2 className="mine-section">我提交的申请</h2>
      {loading ? (
        <p className="boot-title">正在找……</p>
      ) : all === undefined || all.length === 0 ? (
        <p className="mine-empty">还没提交过申请。</p>
      ) : (
        <div className="id-grid" style={{ gridTemplateColumns: '1fr' }}>
          {all.map((item) => {
            const role = isRoleKey(item.role) ? findRole(config, item.role) : undefined;
            const times = [
              ...item.submission.slots.map((slot) => describeSelection(config, slot.date, slot.slot)),
              ...item.submission.customTimes.map((time) => `${shortDate(time.date)} · ${time.text}`),
            ];
            return (
              <button
                key={`${item.role}-${item.submission.id}`}
                type="button"
                className="id-card"
                data-theme={role?.theme}
                title="看看这一份的结果"
                onClick={() => navigate(`/status/${item.role}`)}
              >
                <span className="id-name">
                  {role?.emoji} {role?.label ?? item.role}
                </span>
                <span className="id-tagline">{times.join('、') || '（没填时间）'}</span>
                <span className="id-tagline">
                  交于 {shortDate(item.submission.createdAt.slice(0, 10))}
                </span>
                <span className="id-state id-state-on">{STATUS_LABELS[item.submission.status]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- 收到的邀请 ---------- */}
      <h2 className="mine-section">我收到的邀请</h2>
      {invites === undefined ? (
        <p className="boot-title">正在找……</p>
      ) : invites.length === 0 ? (
        <p className="mine-empty">还没有收到过邀请。</p>
      ) : (
        <div className="id-grid" style={{ gridTemplateColumns: '1fr' }}>
          {invites.map((invite) => {
            const role = findRole(config, invite.role);
            return (
              <button
                key={invite.id}
                type="button"
                className="id-card"
                data-theme={invite.role}
                title="点开看这份邀请"
                onClick={() => navigate(`/i/${invite.code}`)}
              >
                <span className="id-name">
                  {role?.emoji} {invite.title}
                </span>
                <span className="id-tagline">
                  {invite.inviteeName.trim() === '' ? '（通用邀请）' : `给 ${invite.inviteeName}`} ·{' '}
                  {invite.date} {invite.timeText}
                </span>
                <span className="id-tagline">{invite.place}</span>
                <span className="id-state id-state-on">{INVITE_STATUS[invite.status]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- 什么都找不到时，把原因讲清楚 ---------- */}
      {hasNothing && (
        <>
          <div className="receipt-hint" style={{ textAlign: 'left' }}>
            <p>
              这一页认的是<strong>这台设备的浏览器</strong>，下面几种情况会变成空的：
            </p>
            <p>· 换了一个浏览器，或者换了手机</p>
            <p>· 清过浏览器缓存 —— 微信里「设置 → 通用 → 存储空间 → 清理缓存」也算</p>
            <p>· 用的是无痕 / 隐私模式，或者浏览器禁用了网站存储</p>
          </div>

          <div className="receipt-hint" style={{ textAlign: 'left' }}>
            <p>
              <strong>为什么会这样：</strong>这个应用不用注册、不用下载，靠的是浏览器里存着的一个
              随机编号和几个邀请码来认人。那些东西没了，就认不出你了 ——
              这是「点开就能填」的代价。
            </p>
          </div>

          <div className="receipt-hint">
            <p>
              <strong>不过别慌：你提交的申请、收到的邀请，牛马那边一直都留着。</strong>
            </p>
            <p>他能看到、能审批、能回复。</p>
            <p className="receipt-hint-key">直接微信问他一句就行</p>
          </div>
        </>
      )}

      <nav className="step-nav">
        <button
          type="button"
          className="btn btn-ghost"
          title="回到首页"
          onClick={() => navigate('/?pick=1')}
        >
          ← 回首页
        </button>
      </nav>
    </main>
  );
}
