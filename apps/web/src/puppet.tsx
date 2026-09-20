/**
 * 那只「精美的小人」—— 也就是牛马本人。
 *
 * 后台可以设男/女（全局一个设定）。为什么是全局而不是每个身份一个：
 * **它代表牛马本人** —— 每个身份一个形象的话，它就从"一个人"变成了"四张贴纸"。
 * 现在它有一个人格，四套材质只是给它换装。
 *
 * 造型上刻意做得圆、软、有高光，而不是简笔线条：
 * 这一页一辈子看一两次，值得画细一点。
 *
 * 所有姿态由 CSS 按 `puppet-<mood>` 驱动（见 invite-page.css），
 * 这里只负责画出**零件**，零件都有稳定的 class，方便单独转某个关节。
 * 纯 SVG，不引第三方库 —— 和项目一贯的取向一致。
 */

export type PuppetMood =
  | 'idle' // 站着不动
  | 'walk' // 从右边走进来
  | 'reach' // 探手去抓
  | 'grab' // 抓到了，举起来
  | 'throw' // 抡圆了扔出去
  | 'grow' // 用力把接受按钮拉大
  | 'sit' // 一屁股坐上去
  | 'point'; // 坐着指着「同意」

export function Puppet({
  gender,
  mood = 'idle',
}: {
  gender: 'male' | 'female';
  mood?: PuppetMood;
}) {
  return (
    <svg
      className={`puppet puppet-${mood}`}
      viewBox="0 0 160 190"
      width="160"
      height="190"
      role="img"
      aria-label="小牛马"
    >
      <defs>
        {/* 身体的高光：左上角一点暖光，让它看起来是圆的、软的 */}
        {/*
          渐变的 stop 颜色走 class 而不是 var() 写在这里 ——
          presentation 属性里的 var() 支持得很不一致，class + CSS 才稳。
        */}
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

      {/* 地上的影子 */}
      <ellipse className="puppet-shadow" cx="80" cy="182" rx="38" ry="7" />

      {/* ---- 腿（分左右，走路时交替）---- */}
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
      {/* 肚皮上浅一块，像小动物 */}
      <ellipse className="puppet-belly" cx="80" cy="126" rx="21" ry="22" />

      {/* ---- 手臂：后面一只、探出去那只单独标出来 ---- */}
      <g className="puppet-arm puppet-arm-back">
        <rect className="puppet-limb" x="30" y="92" width="17" height="42" rx="8.5" />
        <circle className="puppet-paw" cx="38.5" cy="136" r="10" />
      </g>
      <g className="puppet-arm puppet-arm-front">
        <rect className="puppet-limb" x="113" y="92" width="17" height="42" rx="8.5" />
        {/* 抓东西的那只爪子：单独一层，能握起来 */}
        <g className="puppet-hand">
          <circle className="puppet-paw" cx="121.5" cy="136" r="10.5" />
          <path className="puppet-thumb" d="M113 132 q-7 3 -3 9" />
        </g>
      </g>

      {/* ---- 头 ---- */}
      <g className="puppet-head-group">
        {/* 耳朵 */}
        <ellipse className="puppet-ear" cx="40" cy="62" rx="11" ry="16" transform="rotate(-18 40 62)" />
        <ellipse className="puppet-ear" cx="120" cy="62" rx="11" ry="16" transform="rotate(18 120 62)" />

        {/* 角 / 蝴蝶结 —— 男女的区别就在这儿 */}
        {gender === 'male' ? (
          <g className="puppet-horns">
            <path className="puppet-horn" d="M46 30 q-8 -16 2 -22 q6 10 8 20 z" />
            <path className="puppet-horn" d="M114 30 q8 -16 -2 -22 q-6 10 -8 20 z" />
          </g>
        ) : (
          <g className="puppet-bow">
            <path className="puppet-bow-wing" d="M80 26 L56 14 L54 36 Z" />
            <path className="puppet-bow-wing" d="M80 26 L104 14 L106 36 Z" />
            <circle className="puppet-bow-knot" cx="80" cy="26" r="6.5" />
          </g>
        )}

        <circle className="puppet-head" cx="80" cy="64" r="38" fill="url(#pupHead)" />

        {/* 脸 */}
        <g className="puppet-face">
          {/* 眼睛：睁着（有高光）*/}
          <g className="puppet-eyes-open">
            <ellipse className="puppet-eye" cx="67" cy="60" rx="6.5" ry="8" />
            <ellipse className="puppet-eye" cx="93" cy="60" rx="6.5" ry="8" />
            <circle className="puppet-sparkle" cx="69" cy="57" r="2.4" />
            <circle className="puppet-sparkle" cx="95" cy="57" r="2.4" />
          </g>
          {/* 眼睛：眯起来（得意）*/}
          <g className="puppet-eyes-happy">
            <path className="puppet-eye-arc" d="M60 61 q7 -8 14 0" />
            <path className="puppet-eye-arc" d="M86 61 q7 -8 14 0" />
          </g>

          {/* 腮红 */}
          <ellipse className="puppet-blush" cx="54" cy="72" rx="7" ry="4.5" />
          <ellipse className="puppet-blush" cx="106" cy="72" rx="7" ry="4.5" />

          {/* 鼻子：牛鼻子 */}
          <ellipse className="puppet-nose" cx="80" cy="78" rx="15" ry="11" />
          <circle className="puppet-nostril" cx="74.5" cy="77" r="2.6" />
          <circle className="puppet-nostril" cx="85.5" cy="77" r="2.6" />
          {/* 嘴巴 */}
          <path className="puppet-mouth" d="M74 90 q6 5 12 0" />
        </g>
      </g>
    </svg>
  );
}
