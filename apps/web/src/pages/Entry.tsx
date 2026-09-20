import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildDocNumber } from '@niumadate/shared';
import type { RoleConfig } from '@niumadate/shared';
import { BigEmoji } from '../big-emoji';
import { ClosedModal, NiumaMark, SiteClosed, Stamp } from '../components';
import { useConfig } from '../config-context';
import '../entry-ways.css';

/**
 * 入口页。
 *
 * 两副面孔，靠 `?pick=1` 切：
 *   默认       **两条路**：我要约牛马 / 我的记录
 *   ?pick=1    四张身份卡（点「我要约牛马」、或状态页的「换个身份」会来这儿）
 *
 * 为什么默认不是身份卡：老用户点链接进来，想看的是「我那件事怎么样了」，
 * 而不是又选一遍身份。先给两条路，想约的再进去选身份 —— 顺序反过来了，更顺。
 */
export function EntryPage() {
  const config = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [closed, setClosed] = useState<RoleConfig | null>(null);

  /** 想看身份卡。 */
  const picking = new URLSearchParams(location.search).get('pick') === '1';

  // 总开关关掉：整站只留一句暂停营业
  if (!config.site.open) return <SiteClosed config={config} />;

  /*
    **不再自动跳转。**
    以前这里有个「有申请就直接送回状态页」的逻辑 —— 那是主页还只有身份卡的时候定的，
    现在主页本身就是「我要约牛马 / 我的记录」两条路，自己就能走到记录页，
    再自动把人弹走反而像"我点错了什么"。
    主页就老老实实是主页。
  */

  return (
    <main className="paper entry-shell">
      <header className="redhead">
        <NiumaMark size={46} className="head-mark" />
        <p className="doc-number">{buildDocNumber()}</p>
        <h1 className="redhead-title">{config.site.title}</h1>
        <p className="redhead-sub">{config.site.subtitle}</p>
      </header>

      <div className="rule" />

      {picking ? (
        <>
          <p className="entry-hint">先刷一下身份，我好知道该用哪副面孔见你：</p>

          <div className="id-grid">
            {config.roles.map((role, index) => (
              <button
                key={role.key}
                type="button"
                data-theme={role.theme}
                className={role.enabled ? 'id-card' : 'id-card id-card-off'}
                style={{ animationDelay: `${index * 70}ms` }}
                title={
                  role.enabled
                    ? `以「${role.label}」的身份填一份申请`
                    : `「${role.label}」暂停受理，点一下看提示`
                }
                onClick={() => {
                  if (role.enabled) navigate(`/date/${role.key}`);
                  else setClosed(role);
                }}
              >
                <BigEmoji char={role.emoji} size={46} className="id-emoji" />
                <span className="id-name">{role.label}</span>
                <span className="id-tagline">{role.tagline}</span>
                <span className={role.enabled ? 'id-state id-state-on' : 'id-state id-state-off'}>
                  {role.enabled ? '受理中' : '暂停受理'}
                </span>
              </button>
            ))}
          </div>

          <nav className="step-nav">
            <button
              type="button"
              className="btn btn-ghost"
              title="回到上一页"
              onClick={() => navigate('/')}
            >
              ← 回上一页
            </button>
          </nav>
        </>
      ) : (
        /* ---------- 两条路 ---------- */
        <div className="entry-ways">
          <button
            type="button"
            className="way-card way-card-ask"
            title="选个身份，填一份约会申请"
            onClick={() => navigate('/?pick=1')}
          >
            <span className="way-emoji">🐮</span>
            <span className="way-title">我要约牛马</span>
            <span className="way-sub">选个身份，选个时间，点两下就交上去了</span>
          </button>

          <button
            type="button"
            className="way-card way-card-mine"
            title="看我提交过的申请、收到的邀请"
            onClick={() => navigate('/mine')}
          >
            <span className="way-emoji">🗂️</span>
            <span className="way-title">我的记录</span>
            <span className="way-sub">我提交的申请、我收到的邀请，都在这儿</span>
          </button>
        </div>
      )}

      <footer className="seal-row">
        <Stamp text="牛马审批专用章" />
        <span className="seal-note">受理范围：下班后 · 周末 · 老板出差时</span>
      </footer>

      {closed !== null && (
        <ClosedModal
          role={closed}
          title={config.copies.closedTitle}
          onClose={() => setClosed(null)}
        />
      )}
    </main>
  );
}
