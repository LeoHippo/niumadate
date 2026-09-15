import { useNavigate } from 'react-router-dom';
import { findRole, isRoleKey } from '@niumadate/shared';
import { NiumaMark } from '../components';
import { useConfig } from '../config-context';
import { describeSelection, shortDate, STATUS_LABELS } from '../lib';
import { useMySubmissions } from '../use-submission';

/**
 * 「我的申请」：这台设备交过的所有申请。
 *
 * 为什么需要这一页：申请是**认浏览器**的，不是认账号的。
 * 好友换了浏览器、清了缓存、用了无痕模式，就会「明明交过却找不到」。
 * 与其让他一脸懵，不如**正面告诉他**为什么，以及「你的申请其实还在牛马那儿」。
 * 这一段文案是这一页存在的主要理由，别删。
 */
export function MinePage() {
  const config = useConfig();
  const navigate = useNavigate();
  const { all, loading } = useMySubmissions();

  return (
    <main className="paper">
      <header className="redhead">
        <NiumaMark size={46} className="head-mark" />
        <p className="doc-number">{config.site.title}</p>
        <h1 className="redhead-title">我的申请</h1>
        <p className="redhead-sub">这台设备上提交过的，都在这儿</p>
      </header>

      <div className="rule" />

      {loading ? (
        <p className="boot-title">正在找你的申请……</p>
      ) : all === undefined || all.length === 0 ? (
        // ---------- 找不到：把原因讲清楚 ----------
        <>
          <p className="ask">这台设备上没找到你的申请</p>

          <div className="receipt-hint" style={{ textAlign: 'left' }}>
            <p>下面这几种情况会变成这样：</p>
            <p>· 换了一个浏览器，或者换了手机</p>
            <p>· 清过浏览器缓存 —— 微信里「设置 → 通用 → 存储空间 → 清理缓存」也算</p>
            <p>· 用的是无痕 / 隐私模式，或者浏览器禁用了网站存储</p>
          </div>

          <div className="receipt-hint" style={{ textAlign: 'left' }}>
            <p>
              <strong>为什么会这样：</strong>这个应用不用注册、不用下载，
              靠的是浏览器里存着的一个随机编号来认人。那个编号没了，就认不出你了 ——
              这是「点开就能填」的代价。
            </p>
          </div>

          <div className="receipt-hint">
            <p>
              <strong>不过别慌：你交过的申请，牛马那边一直都留着。</strong>
            </p>
            <p>他能看到、能审批、能回复。</p>
            <p className="receipt-hint-key">直接微信问他一句就行</p>
          </div>
        </>
      ) : (
        // ---------- 找到了 ----------
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
                <span className="id-tagline">交于 {shortDate(item.submission.createdAt.slice(0, 10))}</span>
                <span className="id-state id-state-on">{STATUS_LABELS[item.submission.status]}</span>
              </button>
            );
          })}
        </div>
      )}

      <nav className="step-nav">
        <button
          type="button"
          className="btn btn-ghost"
          title="回到身份选择页"
          onClick={() => navigate('/?pick=1')}
        >
          ← 回首页
        </button>
      </nav>
    </main>
  );
}
