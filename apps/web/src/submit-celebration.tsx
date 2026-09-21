import type { RoleKey } from '@niumadate/shared';
import './submit-celebration.css';

/**
 * 交完申请之后那一下。
 *
 * **四个身份四种回执** —— 这是整套「体验贯穿」里最容易被记住的一处：
 *
 *   好兄弟   一句话，然后**直接走**        —— 办完了，没什么好说的
 *   好姐妹   一道光扫过，柔柔地说一句      —— 有仪式感，但不闹
 *   好宝宝   **撒花 + 弹跳**，字数也最多    —— 这是它最兴奋的时刻
 *   DAD&MUM  **打勾 + 编号**，像收据        —— 正式、留痕
 *
 * 时长也跟着性格走：兄弟 400ms、姐妹 900ms、宝宝 1600ms、家长 700ms。
 * 「停留多久」本身就是性格的一部分 —— 兄弟在原地庆祝是很违和的。
 */
export const CELEBRATE_MS: Record<RoleKey, number> = {
  brother: 420,
  sister: 900,
  baby: 1600,
  dadmam: 700,
};

export function SubmitCelebration({ role }: { role: RoleKey }) {
  if (role === 'baby') {
    return (
      <div className="celebrate celebrate-baby" aria-hidden="true">
        <div className="confetti">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={`confetti-bit confetti-bit-${i % 8}`} />
          ))}
        </div>
        <span className="celebrate-emoji">🎉</span>
        <p className="celebrate-title">交上去啦！</p>
        <p className="celebrate-text">等牛马看完了就回你～ 别急，我先替他记着了 💗</p>
      </div>
    );
  }

  if (role === 'sister') {
    return (
      <div className="celebrate celebrate-sister" aria-hidden="true">
        <span className="celebrate-sweep" />
        <span className="celebrate-emoji">✦</span>
        <p className="celebrate-title">发出去啦～</p>
        <p className="celebrate-text">牛马那边收到了。</p>
      </div>
    );
  }

  if (role === 'dadmam') {
    return (
      <div className="celebrate celebrate-dadmam" aria-hidden="true">
        <span className="celebrate-check">✓</span>
        <p className="celebrate-title">申请已提交</p>
        <p className="celebrate-text">编号已生成，请等待审批结果。</p>
      </div>
    );
  }

  // 好兄弟：一句话，走人
  return (
    <div className="celebrate celebrate-brother" aria-hidden="true">
      <p className="celebrate-title">行，交上去了。</p>
    </div>
  );
}
