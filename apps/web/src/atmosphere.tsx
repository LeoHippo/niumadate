import type { RoleKey } from '@niumadate/shared';
import './atmosphere.css';

/**
 * 邀请页的「空气」—— 飘在背景里的那些东西。
 *
 * 这是让页面**从"精美"变成"惊艳"**的那一层。
 * 我先前的做法全是"静态的精美"（材质、形状、排版都对，但空气是死的）；
 * 同类产品（婚礼电子请柬那一类）几乎都用同一招：
 * **纯 CSS 的飘落物 + 发光** —— 参考 lucianofedericopereira/my-wedding
 * 与 junayed-hasan/valentines_blossoming_flower 的做法，都不引第三方库。
 *
 * 四个身份的"落物"不同，密度也不同 —— **飘什么、飘多少，本身就是性格**：
 *   好兄弟   几乎没有，只有几粒很淡的火星 —— 它就该干干净净
 *   好姐妹   珠光花瓣 + 细闪 —— 精致、克制
 *   好宝宝   爱心 + 花瓣 + 星光，最密 —— 这才是它的场子
 *   DAD&MUM  极少的尘埃 —— 正式场合不撒花
 *
 * 性能：只动 transform / opacity（都能走合成层），粒子数封顶 18，
 * 微信内置浏览器也扛得住。低端机与「减少动效」下会关掉（见 CSS）。
 */

interface Speck {
  /** 在粒子里的序号，决定位置、延迟、颜色 */
  index: number;
  kind: string;
}

/** 每种身份飘什么，飘几个。 */
const RECIPE: Record<RoleKey, { kinds: string[]; count: number }> = {
  brother: { kinds: ['ember'], count: 8 },
  sister: { kinds: ['petal', 'pearl'], count: 12 },
  baby: { kinds: ['heart', 'petal', 'spark', 'rose'], count: 18 },
  dadmam: { kinds: ['mote'], count: 8 },
};

export function Atmosphere({ role }: { role: RoleKey }) {
  const { kinds, count } = RECIPE[role];
  const specks: Speck[] = Array.from({ length: count }, (_, index) => ({
    index,
    kind: kinds[index % kinds.length] ?? 'petal',
  }));

  return (
    <div className="atmo" aria-hidden="true">
      {specks.map(({ index, kind }) => (
        <span key={index} className={`atmo-bit atmo-${kind} atmo-i${index % 9}`} />
      ))}
    </div>
  );
}
