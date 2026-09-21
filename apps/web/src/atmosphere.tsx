import type { RoleKey } from '@niumadate/shared';
import './atmosphere.css';

/**
 * 邀请页的「空气」。
 *
 * 用户的原话：「背景好像没有在动，动态效果不高……整体的浪漫感或冲击感没有很强。」
 *
 * 查出来的问题：**之前只有一层飘落物** —— 没有远近、没有景深，
 * 所以眼睛读到的是"平面在动"，不是"空间在动"。
 *
 * 上网找到的做法（heygen-com/hyperframes 的 aurora-drift 组件）说得很准：
 *   「三个超大的、柔和模糊的色场，在深色底上**缓慢漂移**，
 *     给场景**颜色和纵深**，但**不和前景抢**。」
 * 关键不是加更多粒子，是加**一层会流动的光** + 把粒子分成**远近几层**。
 *
 * 所以这里两层一起：
 *   ① 极光 —— 三团很大的柔光在慢慢漂（周期 40~70 秒，几乎察觉不到在动，
 *      但一眼就能感觉"这是个活的场景"）
 *   ② 飘落物 —— 分**远/中/近**三层：远的小、慢、虚；近的大、快、实。
 *      这样才有景深。
 *
 * 四套身份的氛围仍然不同（见 docs/EXPERIENCE.md）。
 * 性能：只动 transform/opacity；柔光用渐变本身做（不用 filter: blur，
 * 那在手机上很贵）；粒子有上限；减少动效时整层关掉。
 */

interface Speck {
  index: number;
  kind: string;
  /** 远 0 / 中 1 / 近 2 —— 决定大小、速度、虚实 */
  layer: 0 | 1 | 2;
}

/** 每种身份飘什么，飘几个。 */
const RECIPE: Record<RoleKey, { kinds: string[]; count: number }> = {
  brother: { kinds: ['ember'], count: 10 },
  sister: { kinds: ['petal', 'pearl'], count: 16 },
  baby: { kinds: ['heart', 'petal', 'spark', 'rose'], count: 24 },
  dadmam: { kinds: ['mote'], count: 10 },
};

export function Atmosphere({ role }: { role: RoleKey }) {
  const { kinds, count } = RECIPE[role];
  const specks: Speck[] = Array.from({ length: count }, (_, index) => ({
    index,
    kind: kinds[index % kinds.length] ?? 'petal',
    // 三层循环分配：远 3 成、中 4 成、近 3 成
    layer: (index % 10 < 3 ? 0 : index % 10 < 7 ? 1 : 2) as 0 | 1 | 2,
  }));

  return (
    <div className="atmo" aria-hidden="true">
      {/* ① 极光：三团很大的柔光在慢慢漂 */}
      <span className="aurora aurora-a" />
      <span className="aurora aurora-b" />
      <span className="aurora aurora-c" />
      {/* 第四团：**异色**的 —— 对比才是"看得见"的原因 */}
      <span className="aurora aurora-d" />
      {/* 一层很淡的暗角，把视线收到中间 */}
      <span className="aurora-vignette" />

      {/* ② 飘落物：三层景深 */}
      {specks.map(({ index, kind, layer }) => (
        <span
          key={index}
          className={`atmo-bit atmo-${kind} atmo-i${index % 9} atmo-l${layer}`}
        />
      ))}
    </div>
  );
}
