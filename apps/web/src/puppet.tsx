/**
 * 那只「精美的小人」—— 也就是牛马本人。
 *
 * 后台可以设男/女（全局一个设定），因为它是**牛马的形象**，
 * 不该每个身份一个 —— 那样就没有人格了，只是四张贴纸。
 *
 * 它是邀请页上最有记忆点的一段的主角：
 * 勾了「不允许拒绝」之后，它从屏幕右边走进来，把婉拒按钮抓走团成团扔了，
 * 再把接受按钮拉大，坐在上面指着「同意」。
 *
 * 纯 SVG，不引第三方库（和项目一贯的取向一致）。
 * 颜色全走 CSS 变量，所以四套材质里能换装。
 */

export type PuppetMood = 'walk' | 'reach' | 'sit' | 'point';

export function Puppet({ gender, mood = 'walk' }: { gender: 'male' | 'female'; mood?: PuppetMood }) {
  return (
    <svg
      className={`puppet puppet-${mood}`}
      viewBox="0 0 140 170"
      width="140"
      height="170"
      role="img"
      aria-label="小牛马"
    >
      {/* 影子 */}
      <ellipse className="puppet-shadow" cx="70" cy="162" rx="34" ry="6" />

      {/* 腿（坐姿时收起来） */}
      <g className="puppet-legs">
        <rect className="puppet-limb" x="50" y="128" width="15" height="26" rx="7.5" />
        <rect className="puppet-limb" x="75" y="128" width="15" height="26" rx="7.5" />
      </g>

      {/* 身体 */}
      <ellipse className="puppet-body" cx="70" cy="108" rx="33" ry="34" />

      {/* 手臂：探出去抓东西的那只手单独一个 class，方便做「抓」的动作 */}
      <g className="puppet-arms">
        <rect className="puppet-limb puppet-arm-back" x="24" y="86" width="16" height="38" rx="8" />
        <rect className="puppet-limb puppet-arm-reach" x="100" y="86" width="16" height="38" rx="8" />
      </g>

      {/* 头 */}
      <circle className="puppet-head" cx="70" cy="56" r="34" />

      {/* 角 / 蝴蝶结 —— 男女的区别就在这儿 */}
      {gender === 'male' ? (
        <g className="puppet-horns">
          <ellipse className="puppet-horn" cx="42" cy="26" rx="9" ry="14" transform="rotate(-24 42 26)" />
          <ellipse className="puppet-horn" cx="98" cy="26" rx="9" ry="14" transform="rotate(24 98 26)" />
        </g>
      ) : (
        <g className="puppet-bow">
          <path className="puppet-bow-wing" d="M70 20 L50 10 L50 30 Z" />
          <path className="puppet-bow-wing" d="M70 20 L90 10 L90 30 Z" />
          <circle className="puppet-bow-knot" cx="70" cy="20" r="5" />
        </g>
      )}

      {/* 耳朵 */}
      <ellipse className="puppet-ear" cx="36" cy="58" rx="9" ry="13" />
      <ellipse className="puppet-ear" cx="104" cy="58" rx="9" ry="13" />

      {/* 脸 */}
      <g className="puppet-face">
        {/* 眼睛：坐着得意的时候眯起来 */}
        {mood === 'sit' ? (
          <>
            <path className="puppet-eye-closed" d="M54 54 q6 -6 12 0" />
            <path className="puppet-eye-closed" d="M74 54 q6 -6 12 0" />
          </>
        ) : (
          <>
            <ellipse className="puppet-eye" cx="60" cy="53" rx="5" ry="6.5" />
            <ellipse className="puppet-eye" cx="80" cy="53" rx="5" ry="6.5" />
          </>
        )}
        {/* 鼻子 */}
        <ellipse className="puppet-nose" cx="70" cy="70" rx="13" ry="10" />
        <circle className="puppet-nostril" cx="65" cy="69" r="2.4" />
        <circle className="puppet-nostril" cx="75" cy="69" r="2.4" />
      </g>
    </svg>
  );
}
