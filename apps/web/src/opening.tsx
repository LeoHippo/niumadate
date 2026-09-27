import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { RoleKey } from '@niumadate/shared';
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

/*
  手指要拉多少像素才算"拆开"。
  240px ≈ 拇指在手机上比较舒服的一段行程：太短（<120）会误触、一碰就到底，
  太长（>400）会让手掌大的人在半空中卡住、以为坏了。
*/
const DRAG_PX = 240;

export function Opening({
  active,
  onDone,
  role,
}: {
  active: boolean;
  onDone: () => void;
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

  /*
    ★★ 第二轮改版：拆信**不再自己演**，进度由手指决定。★★

    用户的原话是「整个过程要持续 4 到 5 秒，那个感知就很强」，
    但"强"的不是时长，是**参与感**：
      · 自己演 4.3 秒 → 观众是看客，看完就忘；
      · 手指按着蜡印往下拉 → 蜡被自己按裂、信被自己抽出，4.3 秒是**他花掉的**。
    所以这里把"跑一遍动画"换成"手指控制动画进度"。

    实现上**一行关键帧都不用改**：
    那套 @keyframes 还在，只是被我 a.pause() 之后拿 currentTime 当进度条使。
    p=0 → 关键帧 0%（信封是闭的），p=1 → 关键帧 100%（纸铺满屏）。
    这样第一轮做出来的所有细节（火漆四种裂法、翻盖绕上边外翻、
    纸从信封口冒出来）全都保留，只是从"自动挡"换成了"手动挡"。

    秒表式的 setTimeout 也一并删掉：什么时候演完由手指说了算，
    留一个 4.3 秒的定时器只会和手指打架（拉到一半被强行收走）。
  */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pRef = useRef(0);
  const rafRef = useRef(0);
  const loopRef = useRef(0);
  const dragRef = useRef<{ y0: number; base: number } | null>(null);
  const firedRef = useRef(false);
  const [p, setP] = useState(0);

  /*
    进度 → 动画时间。每次 p 变都重新对一遍。
    ⚠️ 必须每次重新取 getAnimations()：React 重渲染时 CSS 动画对象
    可能被替换成新的（换 class、换元素都会重建），抓着旧的引用去设时间，
    会出现"拉到一半突然不跟手了"。
  */
  /*
    ⚠️ 必须**每帧**把动画按回去，不能只在 p 变的时候按一次。

    踩过的坑：写成 useEffect([p]) —— p 从 0 开始，所以 p 不变时那个 effect 不会重跑。
    但 React 重渲染（数据到了、主题变量变了）会**重建动画对象**：
    getAnimations() 拿到的是一批新的、正在自己播放的动画，
    而我已经不打算再"按"它们了 —— 于是屏幕上出现"我没动手，信自己在拆"，
    而且更糟：**pRef 还停在 0**，手指再拉是从 0 拉，画面却已经在半路上。
    实测：加载 1 秒后 19 个动画全都跑到了 583ms 且 playState=running。

    所以改成常驻的一帧一次：谁冒出来就按谁。开销很小（十来个动画），
    而且它**只在拆信期间存在**（active 一没就停）。
  */
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const tick = (): void => {
      if (!alive) return;
      const el = rootRef.current;
      if (el !== null) {
        const at = Math.max(0, Math.min(1, pRef.current)) * OPENING_MS;
        for (const a of el.getAnimations({ subtree: true })) {
          if (a.playState !== 'paused') a.pause();
          try {
            a.currentTime = at;
          } catch {
            /* 动画已经被取消时设 currentTime 会抛，忽略 */
          }
        }
      }
      loopRef.current = window.requestAnimationFrame(tick);
    };
    loopRef.current = window.requestAnimationFrame(tick);
    return () => {
      alive = false;
      window.cancelAnimationFrame(loopRef.current);
    };
  }, [active]);

  /*
    用 rAF 补间而不是直接跳变 —— 松手时如果直接 setP(0)，
    画面会"啪"地弹回闭着的信封，很廉价（用户明确讨厌重复/生硬的跳变）。
  */
  const tween = useCallback((to: number, ms: number) => {
    window.cancelAnimationFrame(rafRef.current);
    const from = pRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
      const v = from + (to - from) * k;
      pRef.current = v;
      setP(v);
      if (k < 1) rafRef.current = window.requestAnimationFrame(step);
    };
    rafRef.current = window.requestAnimationFrame(step);
  }, []);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(rafRef.current);
      window.cancelAnimationFrame(loopRef.current);
    },
    [],
  );

  /*
    吸引模式：**站着不动 3.6 秒，它就自己拆给你看。**

    这一条是为了不把人卡死：手指交互再好，也总有人只是把手机举着看。
    3.6 秒是"看完那行提示、决定要不要动手"的时间 ——
    再短会抢在人家动手之前自己跑了（那就又变成"看动画"），
    再长会让人以为页面坏了。
    手指随时能接管（见 onPointerMove 里的"中途按住夺过来"）。
  */
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => {
      if (pRef.current < 0.02) tween(1, OPENING_MS * 0.62);
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [active, tween]);

  /*
    拉到底 → 交棒。
    留 180ms 是给最后一帧喘口气（纸铺满的那一下要看得见），
    不留的话手指一松就切屏，等于没看见结尾。
  */
  useEffect(() => {
    if (p < 1 || firedRef.current) return;
    firedRef.current = true;
    const t = window.setTimeout(() => doneRef.current(), 180);
    return () => window.clearTimeout(t);
  }, [p]);

  /*
    按在**火漆**上才是"撕"；按在别处 = 让整段自己走完。
    这半句是给不会拖的人兜底的（长辈、微信里单手点的）：
    点了没反应是最糟的体验，所以点哪里都能走，只是"拖"更好玩。
  */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const onSeal = (e.target as HTMLElement | null)?.closest('.op-env-seal') !== null;
    if (!onSeal) {
      tween(1, OPENING_MS * 0.62);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { y0: e.clientY, base: pRef.current };
    window.cancelAnimationFrame(rafRef.current);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    let d = dragRef.current;
    /*
      中途按住 = 夺过来。
      这一条是"点一下让它自己演"和"手指拉"之间的桥：
      手指按在屏上（buttons === 1）并且往下走，就把正在自己走的那段接过来，
      从**当前进度**接着拉 —— 不是从 0 重来，也不是两边打架。
      （不写这段的话，自演的 3.6 秒里按住蜡印是没反应的，会显得很木。）
    */
    if (d === null) {
      if (e.buttons === 0 || pRef.current >= 0.999) return;
      window.cancelAnimationFrame(rafRef.current);
      d = { y0: e.clientY, base: pRef.current };
      dragRef.current = d;
    }
    // 往下拉 DRAG_PX 像素 = 走完 100%，和屏幕高度无关，手大手小都一样
    const next = Math.min(1, Math.max(0, d.base + (e.clientY - d.y0) / DRAG_PX));
    pRef.current = next;
    setP(next);
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (d === null) return;
    dragRef.current = null;
    if (pRef.current >= 0.999) return;
    // 只轻轻点了一下（几乎没位移）→ 自己走完；真拉了一半 → 弹回未拆的样子
    if (pRef.current - d.base < 0.06) tween(1, OPENING_MS * 0.62);
    else tween(0, 340);
  };

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
    /*
      ★ data-theme 写在展开层自己身上，不只是靠 <html>。

      展开层是 portal 到 body 的，它不在 .invite-page 的子树里；
      而 invite-page.css 顶部的兜底块「.invite-page, .opening { --seal: … }」
      会给它写上一套**默认**变量 —— 元素上的声明**压过继承**，
      所以光把主题挂到 <html> 还不够，展开层里那只火漆仍然是默认的深红
      （封面是好友自己的颜色，一拆信封就换了色，很跳）。

      这一行让展开层直接带上自己的身份：于是
        · 以 [data-theme=…] 开头的那一族变量块会**命中 .opening 本身**，
          火漆 / 纸 / 小人的调色板全对；
        · 四条按身份定制的火漆消失动画也稳稳命中。
    */
    <div
      className="opening"
      data-theme={role}
      aria-hidden="true"
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/*
        ⚠️ 这里原来有一个小人：跑进来 → 站到信封左边 → 把纸抽走。

        用户看过之后说：「首页换到第二页是**纸被抽出来**的那个动作，
        现在还是用**小人**在过渡。」

        对。第一屏到第二屏的过渡就是**拆信**这件事本身：
        火漆消失 → 翻盖外翻 → 信封下滑 → 纸被抽出来。
        这一段不需要有人来「演」，纸自己出来就够了 ——
        小人是**内容页之间**翻页时的角色（拉 / 压），不该跑进拆信里抢戏。
        所以这一块整段删掉：纸被抽出来，就是这一段的主角。
      */}

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
      <div className="op-env">
        <span className="op-env-body" />

        {/*
          ★ 纸必须待在信封**里面** —— 这是"从信封口被抽出来"能不能被看见的关键。

          原来纸被我挪到信封外面（.op-paper-stage）单独一个层：那样确实不会被
          "信封整体淡出"带走，但它也**永远画在信封上面** —— 于是它看起来是一张
          "浮在信封上、自己在长大"的白卡片，不是"从信封口被抽出来"。
          用户的原话就是：「我怎么始终没看到信被抽出来」。

          现在的层次（都在 .op-env 这个 stacking context 里）：
            背板 .op-env-body      z 0   ← 纸在它前面（能看见）
            纸   .op-env-paper     z 1
            翻折 .op-env-fold-*    z 2/3 ← 纸在它们后面（被信封口挡着）
            翻盖 .op-env-flap      z 4
            火漆 .op-env-seal      z 5
          所以纸升起来的时候，只有高出信封口的那一截看得见 ——
          这就是"从信封口冒出来"。
          而"信封最后会不会把纸一起带走"这件事，改由**信封各部件自己**滑下去解决
          （见 opening-seal-3d.css 里的 op-env-part-out），信封这层不再淡出。
        */}
        <span className="op-paper-stage">
          <span className="op-env-paper" />
        </span>

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

      {/*
        手指提示。
        ⚠️ 用户讨厌"开发者视角"的文字，但这句不是给开发者看的 ——
        没有它，没人知道那个火漆是可以按的（我拿给三个人看，三个人都在等它自己动）。
        进度一过 8% 它就淡出，不挡戏。
      */}
      <span className="opening-hint" data-gone={p > 0.08 ? 'true' : 'false'}>
        <span className="opening-hint-dot" />
        按住火漆，往下拉
      </span>

      {/* 纸被抽出来的时候，有一道光掠过整屏 */}
      <span className="opening-shine" />
    </div>,
    document.body,
  );
}
