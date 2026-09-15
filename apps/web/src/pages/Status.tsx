import { useContext } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { buildDocNumber, copiesFor, findRole, isRoleKey } from '@niumadate/shared';
import { Puppet, Stamp } from '../components';
import { ConfigContext } from '../config-context';
import { describeSelection, isSubmissionActive, shortDate, STATUS_LABELS, statusCopy } from '../lib';
import { usePageTheme } from '../theme';
import { useMySubmission } from '../use-submission';

/**
 * 状态页：回执 / 驳回结果。
 *
 * 单独一条路由，就是为了避免「填写页既要判断状态又要渲染表单」——
 * 之前那样写，被驳回后点「重新填一份」再选同一个身份，会又跳回驳回页，死循环。
 */
export function StatusPage() {
  const config = useContext(ConfigContext);
  const navigate = useNavigate();
  const params = useParams();
  const roleKey = params.role ?? '';
  const { submission, loading } = useMySubmission(roleKey);

  const role = config === null || !isRoleKey(roleKey) ? undefined : findRole(config, roleKey);

  // 钩子必须在任何提前 return 之前调用，否则钩子数量会时多时少
  usePageTheme(role?.theme);

  if (config === null) return null;

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

  if (loading) {
    return (
      <main className="paper" data-theme={role.theme}>
        <p className="boot-title">牛马正在赶来……</p>
      </main>
    );
  }

  if (submission === null || submission === undefined) {
    return <Navigate to={`/date/${roleKey}`} replace />;
  }

  /** 这个身份最终生效的文案（四个身份口气不一样）。 */
  const copies = copiesFor(config, role.key);
  const copy = statusCopy(submission.status, copies);
  const active = isSubmissionActive(submission, config.reopenAfterDays);

  // 约会日过了：状态没什么好看的，直接放回去重填
  if (!active && submission.status !== 'cancelled') {
    return <Navigate to={`/date/${roleKey}`} replace />;
  }

  // ---------- 被驳回 ----------
  if (submission.status === 'cancelled') {
    return (
      <main className="paper" data-theme={role.theme}>
        <header className="redhead">
          <p className="doc-number">{buildDocNumber()}</p>
          <h1 className="redhead-title">{role.label} · 审批结果</h1>
        </header>
        <div className="rule" />

        <section className="receipt">
          <Stamp text="已驳回" />
          <p className="art-text">这次没约上</p>
          <Puppet mood="cry" />
          <p className="receipt-apology">{copies.rejected}</p>

          <dl className="receipt-list">
            <div>
              <dt>申请人</dt>
              <dd>{submission.name}</dd>
            </div>
            <div>
              <dt>原时间</dt>
              <dd>
                {submission.slots.map((item) => (
                  <span key={`${item.date}|${item.slot}`} className="receipt-custom">
                    {describeSelection(config, item.date, item.slot)}
                  </span>
                ))}
                {submission.customTimes.map((item) => (
                  <span key={`${item.date}|${item.text}`} className="receipt-custom">
                    {shortDate(item.date)} · {item.text}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>牛马回复</dt>
              <dd className="dd-strong dd-note">
                {submission.adminNote === '' ? '（牛马没写理由，直接微信问他）' : submission.adminNote}
              </dd>
            </div>
          </dl>
        </section>

        <div className="receipt-hint">
          <p>想换个时间再约一次，直接点下面重新填。</p>
          <p>要是不想重填，或者想问清楚，</p>
          <p className="receipt-hint-key">请直接微信联系牛马</p>
        </div>

        {/*
          重新填一份 = 重新开一单。

          **不绕回入口页**：入口页只要发现本机有申请，就会把人送回状态页，
          绕一圈还会回到这里 —— 而且好友已经选过身份了，没必要再选一遍。
          带上 ?again=1 直接进这个身份的表单。

          暂停营业时不给这个入口，否则点下去只会撞到卷帘门，白跑一趟。
        */}
        {config.site.open ? (
          <div className="row-center">
            <button
              type="button"
              className="btn btn-primary btn-big"
              title="用同一个身份，重新填一份申请"
              onClick={() => navigate(`/date/${roleKey}?again=1`)}
            >
              重新填一份
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              title="换一个身份重新填"
              onClick={() => navigate('/?pick=1')}
            >
              换个身份
            </button>
          </div>
        ) : (
          <div className="receipt-hint">
            <p>牛马正在闭关，这会儿没法重新填。</p>
            <p className="receipt-hint-key">等开门，或者直接微信催他</p>
          </div>
        )}
      </main>
    );
  }

  // ---------- 正常回执 ----------
  return (
    <main className="paper" data-theme={role.theme}>
      <header className="redhead">
        <p className="doc-number">{buildDocNumber()}</p>
        <h1 className="redhead-title">{role.label} · 申请回执</h1>
      </header>
      <div className="rule" />

      <section className="receipt">
        <Stamp text={STATUS_LABELS[submission.status]} />
        <p className="art-text">{copy.headline}</p>
        <Puppet mood={submission.status === 'accepted' ? 'happy' : 'hot'} />
        {copy.sub !== '' && <p className="receipt-subline">{copy.sub}</p>}

        <dl className="receipt-list">
          <div>
            <dt>申请人</dt>
            <dd>{submission.name}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>
              {submission.slots.length === 0
                ? '见下方自定义时间'
                : submission.slots
                    .map((item) => describeSelection(config, item.date, item.slot))
                    .join('、')}
              {submission.customTimes.map((item) => (
                <span key={`${item.date}|${item.text}`} className="receipt-custom">
                  {shortDate(item.date)} · {item.text}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>地点</dt>
            <dd>{submission.place === null ? '【由你定】' : submission.place}</dd>
          </div>
          {submission.message !== '' && (
            <div>
              <dt>留言</dt>
              <dd className="dd-note">{submission.message}</dd>
            </div>
          )}
          <div>
            <dt>牛马回复</dt>
            <dd className="dd-note">
              {submission.adminNote === '' ? '（牛马还没回复）' : submission.adminNote}
            </dd>
          </div>
          {submission.meetingNote !== '' && (
            <div>
              <dt>你提的要求</dt>
              <dd className="dd-strong">{submission.meetingNote}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="receipt-hint">
        <p>单子已经交上去了，这个页面改不了。</p>
        <p>想取消、想换时间、想改地方、想加人，</p>
        <p className="receipt-hint-key">请直接微信联系牛马</p>
      </div>

      <p className="receipt-note">
        这份回执只存在你这台设备的浏览器里。换了手机、换了浏览器或者清了缓存就看不到了，
        到时候直接在微信上问牛马。
      </p>
    </main>
  );
}
