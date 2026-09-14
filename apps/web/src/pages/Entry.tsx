import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildDocNumber } from '@niumadate/shared';
import type { RoleConfig } from '@niumadate/shared';
import { BigEmoji } from '../big-emoji';
import { ClosedModal, NiumaMark, SiteClosed, Stamp } from '../components';
import { useConfig } from '../config-context';

/** 入口页：红头文件 + 四张身份卡。卡片一直可见，关掉的点进去才甩话。 */
export function EntryPage() {
  const config = useConfig();
  const navigate = useNavigate();
  const [closed, setClosed] = useState<RoleConfig | null>(null);

  // 总开关关掉：整站只留一句暂停营业
  if (!config.site.open) return <SiteClosed config={config} />;

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
