/**
 * 那只「精美的小人」—— 也就是牛马本人。
 *
 * **男女两版，而且必须一眼看得出是两个人。**
 * 第一版只差一个蝴蝶结，等于没差 —— 用户根本看不出来。
 * 现在从四个地方区分：
 *
 *            男（牛马）                女（牛马）
 *   头顶     一对犄角                  大蝴蝶结
 *   脸       方一点、有粗眉毛          圆一点、有长睫毛
 *   身上     领巾                      小围裙
 *   气质     憨、糙                    俏、软
 *
 * 后台设一次，**全局生效**：它代表牛马本人，不该每个身份一个形象 ——
 * 那样它就从「一个人」变成「四张贴纸」了。四套材质只是给它换装。
 *
 * 所有姿态由 CSS 按 `puppet-<mood>` 驱动（见 invite-page.css），
 * 这里只画零件，零件都有稳定的 class，方便单独转某个关节。
 * 纯 SVG，不引第三方库。
 */

export type PuppetMood =
  | 'idle' // 站着不动（会轻轻呼吸）
  | 'walk' // 走
  | 'run' // **跑** —— 身子前倾、步子更大、还带一点土
  | 'cheer' // 高兴地跳一下
  | 'reach'
  | 'grab'
  | 'throw'
  | 'grow'
  | 'sit'
  | 'point'
  | 'pull' // 费劲拉
  | 'fly' // 抓着飞
  | 'press'; // 一屁股压下去

export function Puppet({
  gender,
  mood = 'idle',
}: {
  gender: 'male' | 'female';
  mood?: PuppetMood;
}) {
  const male = gender === 'male';

  return (
    <svg
      className={`puppet puppet-${mood} puppet-${gender}`}
      viewBox="0 0 160 190"
      width="160"
      height="190"
      role="img"
      aria-label={male ? '小牛马（男）' : '小牛马（女）'}
    >
      <defs>
        <radialGradient id="pupBody" cx="36%" cy="28%" r="78%">
          <stop className="puppet-stop puppet-stop-hi" offset="0%" />
          <stop className="puppet-stop puppet-stop-mid" offset="62%" />
          <stop className="puppet-stop puppet-stop-lo" offset="100%" />
        </radialGradient>
        <radialGradient id="pupHead" cx="38%" cy="26%" r="80%">
          <stop className="puppet-stop puppet-stop-hi" offset="0%" />
          <stop className="puppet-stop puppet-stop-mid" offset="66%" />
          <stop className="puppet-stop puppet-stop-lo" offset="100%" />
        </radialGradient>
      </defs>

      <ellipse className="puppet-shadow" cx="80" cy="182" rx="38" ry="7" />

      {/* ---- 腿 ---- */}
      <g className="puppet-leg puppet-leg-l">
        <rect className="puppet-limb" x="58" y="140" width="17" height="32" rx="8.5" />
        <ellipse className="puppet-hoof" cx="66.5" cy="172" rx="10" ry="6" />
      </g>
      <g className="puppet-leg puppet-leg-r">
        <rect className="puppet-limb" x="85" y="140" width="17" height="32" rx="8.5" />
        <ellipse className="puppet-hoof" cx="93.5" cy="172" rx="10" ry="6" />
      </g>

      {/* ---- 身体 ---- */}
      <ellipse className="puppet-body" cx="80" cy="118" rx="37" ry="38" fill="url(#pupBody)" />
      <ellipse className="puppet-belly" cx="80" cy="126" rx="21" ry="22" />

      {/* 男：领巾。女：小围裙。**一眼就能看出是谁。** */}
      {male ? (
        <g className="puppet-scarf">
          <path className="puppet-cloth" d="M62 96 q18 12 36 0 l-4 12 q-14 8 -28 0 z" />
          <path className="puppet-cloth" d="M76 108 l8 0 l3 20 l-7 0 z" />
        </g>
      ) : (
        <g className="puppet-apron">
          <path className="puppet-cloth" d="M63 104 q17 9 34 0 l6 30 q-23 8 -46 0 z" />
          <path className="puppet-apron-string" d="M63 108 q-8 -3 -10 4 M97 108 q8 -3 10 4" />
        </g>
      )}

      {/* ---- 手臂 ---- */}
      <g className="puppet-arm puppet-arm-back">
        <rect className="puppet-limb" x="30" y="92" width="17" height="42" rx="8.5" />
        <circle className="puppet-paw" cx="38.5" cy="136" r="10" />
      </g>
      <g className="puppet-arm puppet-arm-front">
        <rect className="puppet-limb" x="113" y="92" width="17" height="42" rx="8.5" />
        <g className="puppet-hand">
          <circle className="puppet-paw" cx="121.5" cy="136" r="10.5" />
          <path className="puppet-thumb" d="M113 132 q-7 3 -3 9" />
        </g>
      </g>

      {/* ---- 头 ---- */}
      <g className="puppet-head-group">
        <ellipse className="puppet-ear" cx="40" cy="62" rx="11" ry="16" transform="rotate(-18 40 62)" />
        <ellipse className="puppet-ear" cx="120" cy="62" rx="11" ry="16" transform="rotate(18 120 62)" />

        {male ? (
          /* 男：一对犄角 */
          <g className="puppet-horns">
            <path className="puppet-horn" d="M46 30 q-8 -16 2 -22 q6 10 8 20 z" />
            <path className="puppet-horn" d="M114 30 q8 -16 -2 -22 q-6 10 -8 20 z" />
          </g>
        ) : (
          /* 女：大蝴蝶结 —— 做得比第一版大得多，不然看不出来 */
          <g className="puppet-bow">
            <path className="puppet-bow-wing" d="M80 30 L44 12 L40 44 Z" />
            <path className="puppet-bow-wing" d="M80 30 L116 12 L120 44 Z" />
            <path className="puppet-bow-tail" d="M76 36 l-6 18 l10 -2 z" />
            <path className="puppet-bow-tail" d="M84 36 l6 18 l-10 -2 z" />
            <circle className="puppet-bow-knot" cx="80" cy="30" r="8" />
          </g>
        )}

        <circle className="puppet-head" cx="80" cy="64" r="38" fill="url(#pupHead)" />

        <g className="puppet-face">
          {/* 男：粗眉毛。女：长睫毛。 */}
          {male ? (
            <g className="puppet-brows">
              <path className="puppet-brow" d="M58 48 q9 -5 18 -1" />
              <path className="puppet-brow" d="M84 47 q9 -4 18 1" />
            </g>
          ) : (
            <g className="puppet-lashes">
              <path className="puppet-lash" d="M58 54 l-6 -5" />
              <path className="puppet-lash" d="M62 53 l-3 -6" />
              <path className="puppet-lash" d="M102 54 l6 -5" />
              <path className="puppet-lash" d="M98 53 l3 -6" />
            </g>
          )}

          <g className="puppet-eyes-open">
            <ellipse className="puppet-eye" cx="67" cy="60" rx="6.5" ry="8" />
            <ellipse className="puppet-eye" cx="93" cy="60" rx="6.5" ry="8" />
            <circle className="puppet-sparkle" cx="69" cy="57" r="2.4" />
            <circle className="puppet-sparkle" cx="95" cy="57" r="2.4" />
          </g>
          <g className="puppet-eyes-happy">
            <path className="puppet-eye-arc" d="M60 61 q7 -8 14 0" />
            <path className="puppet-eye-arc" d="M86 61 q7 -8 14 0" />
          </g>

          <ellipse className="puppet-blush" cx="54" cy="72" rx="7" ry="4.5" />
          <ellipse className="puppet-blush" cx="106" cy="72" rx="7" ry="4.5" />

          <ellipse className="puppet-nose" cx="80" cy="78" rx="15" ry="11" />
          <circle className="puppet-nostril" cx="74.5" cy="77" r="2.6" />
          <circle className="puppet-nostril" cx="85.5" cy="77" r="2.6" />
          <path className="puppet-mouth" d="M74 90 q6 5 12 0" />
        </g>
      </g>
    </svg>
  );
}
