import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './opening.css';

/**
 * 展开信封 —— 整页的开场。
 *
 * 用户给的思路：「做一个**展开信封**的动作，从里面**掏出来一张纸** ——
 * 这就是一个页面。」所以第一屏点开时**不翻页**，而是演这四拍：
 *
 *   0.0s  火漆先绷一下（要裂没裂的那一下最抓人），然后裂成两半往两边滑开
 *   0.35s 三角形翻盖**绕上边掀起来**（rotateX 到 -168°，父层有 perspective，是真 3D）
 *   1.0s  那张纸**从信封口慢慢抽出来**，一边升一边立起来
 *   1.85s 纸**铺满屏幕** —— 从此刻起，这一屏就是那张纸
 *
 * 总共 2400ms。慢是故意的：这是整页的开场，它得配得上。
 */
export const OPENING_MS = 2400;

export function Opening({ active, onDone }: { active: boolean; onDone: () => void }) {
  /*
    ⚠️ onDone 要用 ref 存。

    调用方传的是内联箭头函数，每次 render 都是新的引用；
    如果我把它写进 useEffect 的依赖里，**每次 render 都会重开计时器** ——
    只要组件在这 2.4 秒里重渲染一次（比如数据轮询），动画就永远演不完。
    ref 让 effect 只依赖 active。
  */
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => doneRef.current(), OPENING_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  /*
    ⚠️ 必须挂到 document.body —— 不能用普通的渲染位置。

    这个组件被渲染在 .invite-page 里面，而那一串祖先带着 transform
    （逐句浮现、卡片进出、屏间过渡都会加 transform）。
    **有 transform 的祖先会成为 fixed 的包含块**，于是 position: fixed
    根本不是"相对视口"，而是相对那个祖先 ——
    实测症状：屏幕上有两个信封，展开层只盖住了下面一小块。

    （同一个坑之前在"小人退到左上角"那里也踩过一次。凡是 fixed 盖全屏的东西，
      一律 portal 到 body，别跟祖先的 transform 赌。）
  */
  return createPortal(
    <div className="opening" aria-hidden="true">
      <div className="op-env">
        <span className="op-env-body" />
        {/* 主角：那张纸 */}
        <span className="op-env-paper" />

        {/* 三片折角 */}
        <span className="op-env-fold op-env-fold-l" />
        <span className="op-env-fold op-env-fold-r" />

        {/* 三角形翻盖（会掀起来）+ 盖在它上面的火漆（会裂开） */}
        <span className="op-env-flap">
          <span className="op-env-seal">
            {/* 裂开时崩出来的八片碎屑，八个方向 */}
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="op-env-dust" />
            ))}
          </span>
        </span>

        <span className="op-env-fold op-env-fold-b" />
      </div>

      {/* 纸被抽出来的时候，有一道光掠过整屏 */}
      <span className="opening-shine" />
    </div>,
    document.body,
  );
}
