import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { buildDocNumber } from '@niumadate/shared';
import type { RoleConfig } from '@niumadate/shared';
import { BigEmoji } from '../big-emoji';
import { ClosedModal, NiumaMark, SiteClosed, Stamp } from '../components';
import { useConfig } from '../config-context';
import { useMySubmissions } from '../use-submission';

/** 入口页：红头文件 + 四张身份卡。卡片一直可见，关掉的点进去才甩话。 */
export function EntryPage() {
  const config = useConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [closed, setClosed] = useState<RoleConfig | null>(null);

  // 钩子必须在任何提前 return 之前调用，否则钩子数量会时多时少
  const { latest, loading } = useMySubmissions();

  /**
   * 想**换个身份**再来一单：状态页里那个入口会带 `?pick=1` 回来。
   * 没有它就自动跳转，有它就老老实实显示身份卡 —— 否则会「跳走 → 点回来 → 又跳走」。
   */
  const picking = new URLSearchParams(location.search).get('pick') === '1';

  // 总开关关掉：整站只留一句暂停营业
  if (!config.site.open) return <SiteClosed config={config} />;

  /*
    已经有申请了 → **直接把好友送回他自己的状态页**。

    点这种链接的人，想看的是「我那件事办得怎么样了」，
    而不是又看一遍「先刷一下身份，我好知道该用哪副面孔见你」。

    查询期间先显示一句话，别先闪一下身份卡再跳走 —— 那样很像页面坏了。
  */
  if (!picking) {
    if (loading) {
      return (
        <main className="paper">
          <p className="boot-title">正在找你的申请……</p>
        </main>
      );
    }
    if (latest !== null && latest !== undefined) {
      return <Navigate to={`/status/${latest.role}`} replace />;
    }
  }

  return (
    <main className="paper">
      <header className="redhead">
        <NiumaMark size={46} className="head-mark" />
        <p className="doc-number">{buildDocNumber()}</p>
        <h1 className="redhead-title">{config.site.title}</h1>
        <p className="redhead-sub">{config.site.subtitle}</p>
      </header>

      <div className="rule" />

      <p className="entry-hint">先刷一下身份，我好知道该用哪副面孔见你：</p>

      <div className="id-grid">
        {config.roles.map((role) => (
          <button
            key={role.key}
            type="button"
            data-theme={role.theme}
            className={role.enabled ? 'id-card' : 'id-card id-card-off'}
            title={role.enabled ? `以「${role.label}」的身份填一份申请` : `「${role.label}」暂停受理，点一下看提示`}
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

      {/*
        交过申请的人再点这个链接，会被自动送回状态页（见上面的跳转）。
        但有两种人会需要这个入口：
          1. 换了浏览器 / 清了缓存，自动跳转认不出他
          2. 想把全部申请翻一遍
        所以入口要一直摆在这儿，不能只给「没申请的人」看。
      */}
      <div className="row-center" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="btn btn-ghost"
          title="看看在这台设备上交过的申请"
          onClick={() => navigate('/mine')}
        >
          我提交过，看看我的申请 →
        </button>
      </div>

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
