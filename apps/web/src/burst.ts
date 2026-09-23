/**
 * 「答应」那一下撒出去的东西。
 *
 * 为什么是算出来的，而不是手写十条方向：
 *   原来只有 10 个方向、每个方向 1~3 片，撒在整屏上稀稀拉拉 ——
 *   看着不像"炸开"，像"掉了几个纸屑"。用户的原话是「完全没有」。
 *
 * 这里用黄金角（137.508°）把 N 片铺开，距离分四档（里外都有），
 * 每片再给一点自己的旋转和延迟 —— 密度、层次、随手感就都出来了。
 * 距离最远 434px，是照着一屏手机（约 390×844）定的：
 * 正好扫过整屏，又不至于一开始就飞出去看不见。
 */
export const GOLDEN_ANGLE = 137.508;

export type BurstPiece = {
  /** 横向位移，CSS 长度 */
  dx: string;
  /** 纵向位移，CSS 长度 */
  dy: string;
  /** 自转角度 */
  rot: string;
  /** 出发延迟 */
  delay: string;
};

function build(count: number): BurstPiece[] {
  return Array.from({ length: count }, (_, i) => {
    const rad = (((i * GOLDEN_ANGLE + 12) % 360) * Math.PI) / 180;
    const tier = i % 4;
    const dist = 170 + tier * 88; // 170 / 258 / 346 / 434
    const spin = (i % 2 === 0 ? 1 : -1) * (300 + ((i * 53) % 420));
    return {
      dx: Math.round(Math.cos(rad) * dist) + 'px',
      dy: Math.round(Math.sin(rad) * dist) + 'px',
      rot: spin + 'deg',
      delay: (i % 7) * 18 + 'ms',
    };
  });
}

/** 一次算好，两个页面共用 —— 实验室里看到的就是好友看到的 */
export const BURST_PIECES: BurstPiece[] = build(120);
