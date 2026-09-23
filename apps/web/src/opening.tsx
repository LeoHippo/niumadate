import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RoleKey } from '@niumadate/shared';
import { Puppet } from './puppet';
import { ROLE_EMOJI } from './role-emoji';
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
/*
  ⚠️ 这个数必须和 opening.css 里那套动画的总时长**对齐**。

  用户要求「动画一到 2 秒，让人看清」，所以那套动画从 2.4s 拉长到了 3.4s。
  如果我忘了改这里，展开层会在动画演到一半时被切掉 ——
  **看起来就是"动画没做到"**（实际是做了一半被掐了）。
  这种"CSS 和 JS 各存一份时长"的地方最容易对不上，MOVE_MS 已经踩过一次。
*/
export const OPENING_MS = 4300;

export function Opening({
  active,
  onDone,
  gender,
  role,
}: {
  active: boolean;
  onDone: () => void;
  gender: 'male' | 'female';
  role: RoleKey;
}) {
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
      {/*
        小人：从**左边跑进来**，站到信封左边，然后把纸抽走。
        用户：「这时候小人跑过来、跑进来，然后把纸张抽出来。」
        它是"过来帮忙的人"，所以比信封靠下一点、靠左一站。
      */}
      <div className="op-puppet">
        <Puppet gender={gender} mood="run" />
      </div>

      {/*
        ★ 纸必须**在信封外面**。
        信封自己的动画（op-env）最后会把自己 opacity 归 0 —— 瘪下去、淡出。
        纸原来是 .op-env 的孩子，于是跟着一起消失了：
        实测 4200ms 时 .op-env-paper 的 opacity 是 1，
        但父层 .op-env 只有 0.001 —— **计算值完全查不出问题，只有看图才发现**：
        整段"抽出来 → 长大 → 铺满屏幕"的结尾是空的，
        观众看到的是下一屏的纸从后面透出来。
        这里给纸一个和信封完全重合的独立舞台（同尺寸、同中心），
        几何一点没变，但它不再被信封带走。
      */}
      <span className="op-paper-stage">
        <span className="op-env-paper" />
      </span>

      <div className="op-env">
        <span className="op-env-body" />

        {/* 三片折角 */}
        <span className="op-env-fold op-env-fold-l" />
        <span className="op-env-fold op-env-fold-r" />

        {/*
          三角形翻盖：**外层只转，内层只裁**。
          ⚠️ 我上一版把 rotateX 和 clip-path 写在同一个元素上，
          clip-path 是 2D 平面的裁剪，转过去之后裁剪形状并不跟着变 ——
          于是"绕着一根轴翻起来"这件事在视觉上**完全没有发生**（实测 opacity 全程 1.00）。
          当时我的结论是"3D 画不出来，撤掉用位移"，那是错的：
          分开给两个元素就成立（实验室里已验证）。
        */}
        <span className="op-env-flap">
          <span className="op-env-flap-face" />
          <span className="op-env-flap-back" />
        </span>

        {/*
          火漆：从翻盖**里面挪出来**做兄弟节点。
          它是"盖在翻盖上"的，翻盖一转它就会被一起带走 ——
          所以让它站在翻盖外面、z-index 更高，两者互不干涉。
        */}
        <span className="op-env-seal">
          <span className="op-env-seal-face">{ROLE_EMOJI[role]}</span>
          {/* 消失时崩出来的八片碎屑（花瓣 / 花 / 渣），八个方向 */}
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="op-env-dust" />
          ))}
        </span>

        <span className="op-env-fold op-env-fold-b" />
      </div>

      {/* 纸被抽出来的时候，有一道光掠过整屏 */}
      <span className="opening-shine" />
    </div>,
    document.body,
  );
}
