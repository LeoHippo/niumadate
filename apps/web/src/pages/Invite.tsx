import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { buildDocNumber, fillInviteName, findRole } from '@niumadate/shared';
import type { Invite, InviteMessage, RoleKey } from '@niumadate/shared';
import { api, describeError } from '../api';
import { useConfig } from '../config-context';
import { usePageTheme } from '../theme';
import { rememberInvite } from '../lib';
import { Atmosphere } from '../atmosphere';
import { Opening } from '../opening';
import { drawPoster } from '../poster';
import { useCountUp } from '../count-up';
import { Puppet } from '../puppet';
import type { PuppetMood } from '../puppet';
import { BURST_PIECES } from '../burst';
import '../invite-page.css';
import '../invite-flow.css';
import '../invite-motion.css';
/*
  ⚠️ 这一行**必须**紧跟在 invite-motion.css 之后，而且必须**在这里**导入。

  我第一版把它放在 main.tsx 里 —— 但 invite-motion.css 是**组件**导入的，
  打包后组件样式排在 main.tsx 的样式之后，于是旧的分镜把我的覆盖掉了：
  实测页面的位移是一条平滑加速曲线（0 4 11 33 73 145 245 360 427），
  完全没有"顿住"的平台期 —— 设计出来的分镜根本没让人看到。
  （用户那句"设计不让人看到就等于没设计"说的就是这个。）

  放在这里、排在它后面，关键帧重定义才会赢。
*/
import '../puller-choreography.css';
import '../puppet-acts.css';
import '../envelope.css';
/*
  ⚠️ 必须**最后一个**导入。

  这个文件是"动效时长的唯一出处"，里面全是 !important ——
  它要覆盖 motion-floor.css / invite-motion.css / puller-choreography.css /
  envelope.css / opening.css 里所有关于时长的规则。
  CSS 里同权重比的是"谁在后面"，所以它得排最后。
*/
import '../timing-truth.css';
import '../opening-fixes.css';
import '../seal-round.css';
import '../all-cards.css';
import '../invite-wow.css';
import '../invite-card.css';
import '../invite-shape.css';
/*
  ⚠️ **必须最后一个**。

  这个文件专门推翻「减弱动态效果」下面那一堆 display:none。
  用户的反馈是「这些都没有」，而我这边的环境 reduce-motion=false，
  永远复现不出来 —— 问浏览器要动画状态，全部 running、时间也对，
  说明动画本身没问题，是**他的设备开着减弱动态效果**，
  而我在那个模式下把氛围层、过渡纱、爆发、信封落下**全藏起来了**。

  「减弱」应该是"减少运动"，不是"删除内容"。
  东西不见了是 bug；只是没那么晃，才叫减弱。

  它要覆盖前面所有文件里的 reduce-motion 规则，所以排最后。
*/
import '../reduced-motion-is-not-delete.css';
/* 排查用的最后一道：?motion=on 强制走完整动画 */
import '../motion-debug.css';
/*
  纸的观感（比背景亮的纸色 + 看得见的边 + 纸影 + 纸纹）。
  用户看实机截图说「纸张怎么跟背景是一个颜色的？没有那个框呀，没有纸的质感呀」——
  根因是卡片和页面用了同一个 --paper。这个文件给"纸"一套自己的颜色。
*/
import '../paper-look.css';
/*
  「小人很费劲地拖纸」，4.5 秒。

  用户：「之后的翻页都不是小人很费劲地拖着走呀……整个过程要持续 4 到 5 秒，
  那个感知就很强。」关键是**前两次使劲纸纹丝不动** ——
  观众看到"拉不动"才会觉得重；省了这一步，就只是"滑过去"。
*/
import '../puller-struggle.css';
/* 看实机截图之后的微调：徽章统一成圆、纸在桌面上放大 */
import '../paper-look-2.css';
import '../paper-look-3.css';
/*
  ⚠️ 最后一个（针对开场）。

  我把开场逐帧截下来**自己看了**：1000/1700/2400/3000ms 四帧**一模一样**。
  计算值说"火漆透明度在变"，画面上却纹丝不动。查到的原因：
    ① 翻盖用 rotateX，但它同时有 clip-path —— clip-path 是 2D 裁剪，
       转过去之后裁剪形状不变，于是"翻开"在视觉上根本没发生
    ② 纸藏在信封里，而且纸色和信封内部几乎同色，出来了也看不出来
    ③ 小人位置算错，opacity=1 却不在画面里
  这个文件彻底改用 2D 变换（位移 + 缩放 + 透明度）—— 那些一定会被画出来。
*/
import '../opening-2d.css';
/*
  ⚠️ 根因修复：**没定位的元素，z-index 无效**。

  逐帧截图之后才看清：计算值说 火漆0.44 / 纸0.44 / 小人0.94，
  画面里只有火漆被画出来（它有 position: absolute），
  纸和小人因为**没有 position**，z-index 直接失效，一直躺在信封底下 ——
  opacity 一直在变，只是被盖住了，所以"什么都看不到"。
  这个文件把开场里每个元素都显式定位 + 显式给 z-index。
*/
import '../opening-position.css';
// 必须放在最后：翻盖的真·3D 翻转 + 火漆的四种消失都在这份里，
// 它要盖掉前面 opening.css / opening-2d.css 里那两套旧做法。
import '../opening-seal-3d.css';
// 最后的美学一遍（纸的质感 / 请柬可读性 / 回答屏的摘要），必须最后加载
import '../paper-look-4.css';
// 火漆与信封的材质（颜色家族 / 高光暗边 / 翻盖投影），同样必须最后加载
import '../wax-real.css';

/**
 * 好友点开邀请链接看到的页面。
 *
 * **一页一页推进，不是一封信一次性展开。**
 *
 * 这两种做法差别很大：
 *   一次性展开 → 「哇，好看」      （观赏）
 *   一页一页   → 「然后呢？」      （**期待**）
 *
 * 用户要的是后者：有点神秘、有点被吊着、想看下一屏写的是什么。
 * 所以每屏只讲一件事，中间由小人做过渡，节奏交给他自己的手指。
 *
 * 但**不能把人关在流程里** —— 赶时间的人点「看全部」就能一次看完（那一版是信纸长卷）。
 *
 * 视觉上刻意不复用填写页那四套皮：填写页天天用要克制，
 * 这页一辈子看一两次，所以放开了做 —— 四套**材质**：
 *   好兄弟 牛皮纸+酒渍+深红火漆 / 好姐妹 珠光信笺+玫瑰金
 *   好宝宝 奶油纸+云+糖果色     / DAD&MUM 红头文件+钢印
 */

type Screen =
  | 'seal'
  | 'who'
  | 'when'
  | 'where'
  | 'what'
  | 'word'
  /** 收拢成一张正式的请柬：时间 / 地点 / 事由 / 邀请人，一眼看全。 */
  | 'card'
  | 'answer'
  | 'chat';

/*
  屏的顺序是**故意的**：
    先把悬念一页页铺开（谁请你 → 什么时候 → 在哪 → 干嘛 → 几句话），
    **最后收拢成一张能看全、能存下来的请柬**，再问去不去。
  这就是收到纸质请柬的过程 —— 拆信封、一张张看、最后拿到那张卡片。
  「信息量明确」和「有悬念」不矛盾，顺序对了就都有。
*/
const SCREENS: readonly Screen[] = [
  'seal',
  'who',
  'when',
  'where',
  'what',
  'word',
  'card',
  'answer',
  'chat',
];

/** 一共几屏 —— 编号要用（01/08 那种）。 */
const SCREEN_TOTAL = SCREENS.length;

/** 请柬上要写星期几 —— 不然收到的人不知道要不要请假。 */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 把 `2026-09-20` 写成请柬上的样子：2026 年 9 月 20 日（周日）。 */
/**
 * 倒计时：还有几天。
 *
 * 网易云那套的招牌就是**数字滚动增长** —— 它的作用不是好看，是**引导视线**：
 * 静止的数字一眼扫过，正在涨的数字你会盯着它涨完。
 * 而且它没有"喧宾夺主"的问题 —— 它就是主角。
 */
function CountUp({ target, unit }: { target: number; unit?: string }) {
  const shown = useCountUp(target);
  return (
    <span className="count-up">
      {shown}
      {unit === undefined ? null : <span className="count-unit">{unit}</span>}
    </span>
  );
}

/** 还有几天（按本地零点算，不受时区影响）。 */
function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** 地点点一下跳到高德去搜 —— 收到请柬的人真正需要的是这个。 */
function mapSearchUrl(place: string): string {
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(place)}&src=niumadate`;
}

function fullDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getFullYear()} 年 ${parsed.getMonth() + 1} 月 ${parsed.getDate()} 日（${WEEKDAYS[parsed.getDay()] ?? ''}）`;
}

/** 屏与屏之间的三种过渡 —— 轮着来，别每次都一样。 */
const MOVES = ['pull', 'fly', 'press'] as const;
type Move = (typeof MOVES)[number];

/**
 * 两个按钮的**说法**也按身份不同。
 *
 * 这是最便宜、也最能说明「我在跟谁说话」的一处 ——
 * 同一句「接受」，兄弟说「行，就这么定」，宝宝说「好！我去！」，
 * 家人说「同意」。**动词就是人设。**
 *
 * 婉拒那边也一样：家人的「不同意」正式得像在盖章，
 * 宝宝的「那天不行嘛」是在撒娇。
 */
const ANSWER_WORDS: Record<RoleKey, { yes: string; no: string }> = {
  brother: { yes: '行，就这么定', no: '不去' },
  sister: { yes: '好呀～', no: '那天不太行' },
  baby: { yes: '好！我去！', no: '那天不行嘛' },
  dadmam: { yes: '同意', no: '不同意' },
};

const MOVE_MOOD: Record<Move, PuppetMood> = { pull: 'pull', fly: 'fly', press: 'press' };

/** 过渡要放多久。太短看不见，太长让人等。 */
/*
  换屏的时点。

  ⚠️ 这个数必须 **≥ CSS 里 .puller 的动画时长**（现在是 1100ms），
  否则小人还没把屏拖走，屏幕就已经换掉了 —— 看起来就是"闪了一下"。
  用户的原话：「页面切换的动作太快了，那个牛马都看不见。
  动画速度我的建议是 0.6 秒左右，反正就是要给足人类的反应时间。」

  所以：卡片本身 600ms（用户点名的数），
       小人拖屏 1100ms（表演比反馈慢，得一步一步看得清）。
  JS 这个时点跟着最长的那一段走。
*/
/*
  ⚠️ 这个数必须 ≥ CSS 里 .puller / .card-leaving-* 的动画时长（现在是 4500ms）。

  用户明确要求：「整个过程要持续 4 到 5 秒，那个感知就很强。」
  之前是 1600ms —— 快到只看得见"换了一屏"，看不见"有人在用力"。

  （CSS 和 JS 各存一份时长这件事已经踩过两次坑，注释里写死。）
*/
const MOVE_MS = 4500;

export function InvitePage() {
  const config = useConfig();
  const params = useParams();
  const code = params.code ?? '';

  const [data, setData] = useState<{ invite: Invite; messages: InviteMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  /*
    正在**展开信封**。

    用户思路里的关键一步：「做一个展开信封的动作，从里面掏出来一张纸 ——
    这就是一个页面。」所以第一屏点开时**不翻页**，而是演这一段：
    火漆裂开 → 翻盖掀起 → 纸抽出来 → 铺满屏幕（约 2.4 秒）。
    演完才切到第二屏，而且切的时候纸已经铺满了，接得上。
  */
  const [opening, setOpening] = useState(false);
  /** 赶时间的人：一键摊开看全部。 */
  const [showAll, setShowAll] = useState(false);

  /*
    ★★ 这一行是这轮最重要的修复，必须写清楚 ★★

    展开层（Opening）是 createPortal 挂到 document.body 的 ——
    它**不在 .invite-page 的子树里**，所以：
      · .invite-page[data-theme='baby'] 上的那一套变量（--seal / --sheet / 纸色…）
        它一个都拿不到；
      · 我写的那四条按身份定制的火漆消失动画
        ［data-theme='x'］ .opening .op-env-seal 也全都选不中 ——
        因为 <html> 上**根本没有 data-theme**。
    结果就是：不管好友是什么身份，展开动画里的火漆永远走
    .opening .op-env-seal 里那个**兜底的兄弟版**（平淡淡出），
    颜色也退回 opening.css 里写死的橙红 —— 而封面上的火漆是好友自己的颜色。
    也就是说：我做的另外三套消失动画，在真实页面上**从来没被用过**。

    我之前"验证过四套都在"，是因为我的截图脚本里手动写了
    document.documentElement.dataset.theme = 'sister' ——
    **测试脚本自己把缺的东西补上了**，所以四套看起来都正常。
    这是这轮最大的教训：验证手段不能替产品补它缺的东西。

    修法：邀请页挂载时把邀请人的主题挂到 <html>（离开时自动摘掉）。
    Opening 是 body 的孩子，于是它终于能看见这套主题。
  */
  usePageTheme(data?.invite.role);
  /*
    「存下这张请柬」存下来的那张图（dataURL）。
    ⚠️ 这个 useState **必须**和其他 state 放在一起 —— 不能放在
    `if (config === null) return null` 之后：那样加载中只跑一部分 Hook、
    加载完再跑全部，React 会报 #310（渲染间 Hook 数量不一致）。
    实测踩过，页面直接白屏，错误边界显示「页面崩了」。
  */
  const [poster, setPoster] = useState<string | null>(null);
  /**
   * 正在进行的过渡。
   *
   * 关键是**当前这一屏自己要走**：小人蹦出来把整屏拉走 / 推走，
   * 而不是淡出、也不是只让旁边的小人动一下 ——
   * 「页面被它拖走了」这个感觉，才是这个过渡的全部意义。
   */
  const [leaving, setLeaving] = useState<Move | null>(null);

  /*
    转场里小人的**姿态**，跟着分镜的节拍一段一段换。

    用户的原话：「牛马的这个动作还是不够精细……应该有那种**过程感**，
    让人们能看到这个我精心设计的这个过程。」

    之前整段只有一个姿势（`MOVE_MOOD[leaving]`）—— 位置在动，人没在演。
    现在按节拍切：够过去 → 抓住 → 使劲；压是直接压；飞是够 → 抓 → 抛。

    时点要和 puller-choreography.css 里那张时间表对齐
    （蓄势 0~20%、抓住 24%、第 1 顿 34%、顿住 46%、第 2 顿 58%）。
  */
  const [acting, setActing] = useState<PuppetMood | null>(null);
  useEffect(() => {
    if (leaving === null) {
      setActing(null);
      return;
    }
    const plan: Record<Move, [number, PuppetMood][]> = {
      // 拉：先举手够过去，抓住，再全身使劲
      pull: [
        [0, 'reach'],
        [150, 'grab'],
        [330, 'pull'],
      ],
      // 压：从上面下来就是压，不铺垫
      press: [[0, 'press']],
      // 飞：够 → 抓 → 拎起来抛
      fly: [
        [0, 'reach'],
        [170, 'grab'],
        [360, 'fly'],
      ],
    };
    const timers = plan[leaving].map(([at, mood]) =>
      window.setTimeout(() => setActing(mood), at),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [leaving]);
  /** 刚过去的那一下是什么动作 —— 决定**新进来的这一屏从哪边滑进来**。 */
  const [enterFrom, setEnterFrom] = useState<Move | null>(null);
  /** 刚刚答应了吗 —— 只在「没回应 → 接受」那一下放爆发，回头再看不再炸。 */
  const justAcceptedRef = useRef(false);



  const load = useCallback(async () => {
    try {
      const result = await api.invite(code);
      setData(result);
      setError(null);
      rememberInvite(code);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 前进：先让**当前这一屏**被小人拉走 / 推走，再换下一屏。
   *
   * 方向是「从哪边出去」：拉 = 往左拖出去，推 = 往右推出去，飞 = 往右上拽走。
   * 下一屏从**相反方向**滑进来，接得严丝合缝 —— 观感上就是
   * 「小人把上面那张拖走，下面这张跟着补上来」。
   */
  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= SCREENS.length) return;
    const picked = MOVES[next % MOVES.length] ?? 'pull';
    setLeaving(picked);
    window.setTimeout(() => {
      setIndex(next);
      setLeaving(null);
      // 新的一屏从**相反方向**补上来，接得上「被拖走」那个动作
      setEnterFrom(picked);
    }, MOVE_MS);
  }, []);

  if (error !== null) {
    return (
      <main className="invite-page" data-theme="baby">
        <div className="invite-broken">
          <span className="invite-broken-emoji">📭</span>
          <p className="invite-broken-title">这份邀请打不开了</p>
          <p className="invite-broken-text">{error}</p>
          <p className="invite-broken-text">
            链接可能会过期，也可能是在微信里被截断了。让牛马重新发一份给你就行。
          </p>
        </div>
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="invite-page" data-theme="baby">
        <p className="invite-loading">正在拆开……</p>
      </main>
    );
  }

  const { invite } = data;
  const role = findRole(config, invite.role);

  /*
    刚刚答应那一刻：铺一层**满屏爆发**。
    只在「从没回应 → 接受」那一下放 —— 回头再访问不该又炸一次，
    那样就变成了噪音。
  */
  const justAccepted = justAcceptedRef.current && invite.status === 'accepted';
  if (invite.status !== 'pending') justAcceptedRef.current = false;


  const screen = SCREENS[index] ?? 'seal';

  /**
   * 把请柬画成一张图（见 poster.ts）。
   *
   * 放在这里是因为：上面那些提前返回（error / data === null）已经走完了，
   * 到这儿 invite、role、config 都一定在。
   * ⚠️ 但 **useState 不能放这儿** —— Hook 必须在所有 return 之前，
   * 否则加载中/加载完两次 render 的 Hook 数量不同，React 报 #310（实测白屏过）。
   * 所以 poster 那个 state 在文件顶上，这里只是个普通函数。
   */
  const savePoster = (): void => {
    const styles = getComputedStyle(document.documentElement);
    const pick = (name: string, fallback: string): string =>
      styles.getPropertyValue(name).trim() || fallback;

    const canvas = drawPoster({
      role: invite.role,
      roleEmoji: role?.emoji ?? '🐮',
      inviteeName: invite.inviteeName,
      dateText: fullDate(invite.date),
      timeText: invite.timeText,
      place: invite.place,
      activity: invite.activity,
      hostName: config.invite.hostName,
      body: invite.body,
      days: daysUntil(invite.date),
      palette: {
        paper: pick('--paper', '#fffaf1'),
        edge: pick('--paper-edge', '#e6d9c2'),
        ink: pick('--ink', '#3a3228'),
        inkSoft: pick('--ink-soft', '#8a7d6b'),
        accent: pick('--accent', '#c8641e'),
        accentDeep: pick('--accent-deep', '#8f3f0d'),
      },
    });

    setPoster(canvas.toDataURL('image/png'));
  };
  const last = index === SCREENS.length - 1;

  return (
    <main className="invite-page" data-theme={invite.role}>
      {/*
        装饰层：**多少本身也是性格**。
        兄弟几乎不摆东西，宝宝摆得最多 —— 这比换配色更能拉开差别。
      */}
      <ShapeDecor role={invite.role} />

      {/* 空气层：四套不同的飘落物 —— 这一层是「惊艳」的来源 */}
      <Atmosphere role={invite.role} />

      {/* 背景：材质底纹 + 光尘 */}
      <div className="invite-backdrop" aria-hidden="true">
        <span className="invite-mote invite-mote-1" />
        <span className="invite-mote invite-mote-2" />
        <span className="invite-mote invite-mote-3" />
        <span className="invite-mote invite-mote-4" />
        <span className="invite-mote invite-mote-5" />
      </div>

      {/*
        「揉成团」用的滤镜。
        CSS 只能缩放旋转，做不出纸被揉皱的**不规则褶皱** ——
        所以用 feTurbulence 生成噪声 + feDisplacementMap 把像素推开，
        按钮一皱，那一"团"就真的有纸感了。
      */}
      <svg className="defs-only" aria-hidden="true" focusable="false">
        <filter id="niuma-crumple">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {showAll ? (
        /* ---------- 赶时间：一次看完 ---------- */
        <LetterAll
          invite={invite}
          roleEmoji={role?.emoji ?? '🐮'}
          hostName={config.invite.hostName}
          hostGender={config.invite.hostGender}
          messages={data.messages}
          onMessages={(messages) =>
            setData((current) => (current === null ? current : { invite: current.invite, messages }))
          }
          onRespond={(status) => {
            void api
              .respondInvite(code, status)
              .then((result) =>
                setData((current) =>
                  current === null ? current : { invite: result.invite, messages: current.messages },
                ),
              )
              .catch((cause: unknown) => setError(describeError(cause)));
          }}
          onBack={() => setShowAll(false)}
        />
      ) : (
        <>
          {/* ---------- 一屏 ---------- */}
          <section
            className={`screen screen-${screen}`}
            key={screen}
            onClick={() => {
              // 只在前面的「叙述屏」上点哪都能继续；按钮屏和对话屏不许误触
              if (screen !== 'answer' && !last) goTo(index + 1);
            }}
          >
            <div
              className={[
                'screen-inner',
                leaving === null ? '' : `card-leaving card-leaving-${leaving}`,
                leaving === null && enterFrom !== null ? `card-entering card-entering-${enterFrom}` : '',
              ]
                .filter((item) => item !== '')
                .join(' ')}
            >
              <ScreenBody
                screen={screen}
                invite={invite}
                roleEmoji={role?.emoji ?? '🐮'}
                hostName={config.invite.hostName}
                hostGender={config.invite.hostGender}
                messages={data.messages}
                onRespond={(status) => {
                  // 答应那一下要放爆发 —— 先记下来，等数据回来再渲染
                  if (status === 'accepted') justAcceptedRef.current = true;
                  void api
                    .respondInvite(code, status)
                    .then((result) => {
                      setData((current) =>
                        current === null
                          ? current
                          : { invite: result.invite, messages: current.messages },
                      );
                      // 回应完自动进对话 —— 定下来之后就该商量了
                      goTo(SCREENS.indexOf('chat'));
                    })
                    .catch((cause: unknown) => setError(describeError(cause)));
                }}
                onMessages={(messages) =>
                  setData((current) =>
                    current === null ? current : { invite: current.invite, messages },
                  )
                }
              />
            </div>
          </section>

          {/* ---------- 底部：进度 + 继续 + 看全部 ---------- */}
          <footer className="screen-bar">
            <div className="screen-dots" aria-hidden="true">
              {SCREENS.map((item, i) => (
                <span key={item} className={i <= index ? 'dot dot-on' : 'dot'} />
              ))}
            </div>

            <div className="screen-bar-row">
              <button
                type="button"
                className="btn btn-ghost screen-skip"
                title="不想一页页看，直接摊开"
                onClick={() => setShowAll(true)}
              >
                看全部
              </button>

              {!last && screen !== 'answer' && (
                <button
                  type="button"
                  className="btn btn-primary screen-next"
                  title="看下一屏"
                  onClick={() => {
                    // 第一屏点开是"拆信封"，不是普通翻页
                    if (screen === 'seal') {
                      setOpening(true);
                      return;
                    }
                    goTo(index + 1);
                  }}
                >
                  轻点继续 →
                </button>
              )}
            </div>
          </footer>

          {/*
            ---------- 屏与屏之间：小人把整屏拖走 ----------

            它**不是**在旁边演一段动画，而是**真的抓着这一屏**：
            蹦到屏幕边 → 抓住 → 使劲把它拖出去。
            所以它得贴在页面上、跟着那一屏一起走，而不是飘在一层遮罩上。
          */}
          {/* 刚答应：满屏爆发。前面那么长的铺垫，就是为了这一下 */}
                    {/* 请柬那一屏下面给一个"存下来"的出口 —— 可收藏本身就是向往感 */}
          {!showAll && screen === 'card' && (
            <button type="button" className="save-poster-btn" onClick={savePoster}>
              存下这张请柬
            </button>
          )}

          {/* 存图面板：手机上长按最容易，桌面上给下载 */}
          {poster !== null && (
            <div className="save-sheet" role="dialog" aria-label="保存请柬">
              <div className="save-sheet-inner">
                <img className="save-image" src={poster} alt="你的请柬" />
                <p className="save-hint">长按图片保存到相册</p>
                <div className="save-actions">
                  <a className="save-download" href={poster} download="请柬.png">
                    下载到电脑
                  </a>
                  <button type="button" className="save-close" onClick={() => setPoster(null)}>
                    收起
                  </button>
                </div>
              </div>
            </div>
          )}

                    {/*
            过渡纱：走的时候徐上来、新的进来时徐下去。
            一上一下之间那一拍，才是"渐入渐出"的感觉 ——
            之前只有"飞出去"，看起来是唰地划过。
          */}
          {leaving !== null && <span className="screen-veil screen-veil-cover" aria-hidden="true" />}
          {leaving === null && enterFrom !== null && (
            <span className="screen-veil screen-veil-reveal" aria-hidden="true" />
          )}

                    {/*
            大编号（01/08）。低对比、尺寸很大 ——
            这是"版面感"的来源，也是网易云那套每屏都有的东西。
            它的作用不是给人读，是让这一屏**看起来是被设计过的**。
          */}
          <span className="screen-step" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
            <span className="screen-step-total">/{String(SCREEN_TOTAL).padStart(2, '0')}</span>
          </span>

          {/*
            展开的时候把原来那一屏**藏起来** ——
            不然屏幕上会同时有一个信封（原地）和一个信封（展开层），
            实测就是这样：上面一个、下面一个，看着像出 bug 了。
          */}

          {/*
            展开信封：火漆裂开 → 翻盖掀起 → 纸抽出来 → 铺满屏幕。
            演完（2400ms）**直接切到下一屏**，不走普通翻页 ——
            因为这时纸已经铺满整屏了，再演一次拖屏反而多余。
          */}
          <Opening
            active={opening}
            role={invite.role}
            gender={config.invite.hostGender}
            onDone={() => {
              setOpening(false);
              setIndex((current) => Math.min(current + 1, SCREENS.length - 1));
            }}
          />

          {justAccepted && <Burst role={invite.role} />}

          {leaving !== null && (
            <div className={`puller puller-${leaving}`} aria-hidden="true">
              {/* 姿态分阶段切（见上面那个 effect）—— 整段一个姿势的话，位置在动但人没在演 */}
              <Puppet
                gender={config.invite.hostGender}
                mood={acting ?? MOVE_MOOD[leaving]}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}

/**
 * 每个身份的装饰。
 *
 * 体现的是「**装饰的多少也是性格**」：
 * 好兄弟几乎什么都不摆（直白的人不搞这些），
 * 好宝宝摆得最满（爱心、玫瑰、星光），
 * 好姐妹是缎带和珠光（克制但有质感），
 * DAD&MUM 摆的全是**正式图形**（表格线、方框、文号），没有一件是装饰性的花。
 */
function Burst({ role }: { role: RoleKey }) {
  // 家人不撒花 —— 盖一个方正的红印压下来，比什么都正式。
  // 但光有一枚印太静了，所以补一圈冲击光环 + 一团暖光：**拍**下去那一下要有声。
  if (role === 'dadmam') {
    return (
      <div className="burst burst-dadmam" aria-hidden="true">
        <span className="burst-flash" />
        <span className="burst-ring" />
        <span className="burst-stamp">同意</span>
      </div>
    );
  }

  // 密度就是"炸开"和"掉了几个纸屑"的区别：兄弟最少（干脆），宝宝最多（最热闹）
  const bits = role === 'brother' ? 40 : role === 'sister' ? 48 : 60;

  return (
    <div className={`burst burst-${role}`} aria-hidden="true">
      <span className="burst-flash" />
      <span className="burst-ring" />
      {BURST_PIECES.slice(0, bits).map((p, i) => (
        <span
          key={i}
          className={`burst-bit burst-bit-${i % 10}`}
          style={
            {
              ['--dx' as string]: p.dx,
              ['--dy' as string]: p.dy,
              ['--rot' as string]: p.rot,
              animationDelay: p.delay,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function ShapeDecor({ role }: { role: RoleKey }) {
  // 直白 —— 一个装饰都不加。空着本身就是态度。
  if (role === 'brother') return null;

  if (role === 'sister') {
    return (
      <div className="decor decor-sister" aria-hidden="true">
        <span className="decor-ribbon" />
        <span className="decor-pearl decor-pearl-a" />
        <span className="decor-pearl decor-pearl-b" />
        <span className="decor-pearl decor-pearl-c" />
        <span className="decor-bow decor-bow-a">🎀</span>
        <span className="decor-bow decor-bow-b">🎀</span>
      </div>
    );
  }

  if (role === 'baby') {
    return (
      <div className="decor decor-baby" aria-hidden="true">
        <span className="d-heart-a">💗</span>
        <span className="d-heart-b">💕</span>
        <span className="d-heart-c">💖</span>
        <span className="d-heart-d">💘</span>
        <span className="d-rose-a">🌹</span>
        <span className="d-rose-b">🌷</span>
        <span className="d-rose-c">🌸</span>
        <span className="d-spark-a">✨</span>
        <span className="d-spark-b">✨</span>
      </div>
    );
  }

  // DAD&MUM：正式图形，没有一件是花
  return (
    <div className="decor decor-dadmam" aria-hidden="true">
      <span className="decor-doc">{buildDocNumber()}</span>
      <span className="decor-rule decor-rule-a" />
      <span className="decor-frame" />
      <span className="decor-rule decor-rule-b" />
    </div>
  );
}

/* ==========================================================================
   每一屏的内容。一屏只讲一件事 —— 这是整页节奏的根基。
   ========================================================================== */

function ScreenBody({
  screen,
  invite,
  roleEmoji,
  hostName,
  hostGender,
  messages,
  onRespond,
  onMessages,
}: {
  screen: Screen;
  invite: Invite;
  roleEmoji: string;
  /** 请柬上「邀请」那一栏写谁。 */
  hostName: string;
  hostGender: 'male' | 'female';
  messages: InviteMessage[];
  onRespond: (status: 'accepted' | 'declined') => void;
  onMessages: (messages: InviteMessage[]) => void;
}) {
  /** 还有几天 —— 用来做倒计时。 */
  const days = daysUntil(invite.date);
  /*
    ⚠️ 这里踩过一次：我原本写成"未来(还没到)时 countdownText = null"，
    然后又用 countdownText === null 去判断要不要渲染整个倒计时块 ——
    结果**最该显示的那一屏反而不显示**（未来才是常态）。
    现在改成只看 days 有没有算出来（NaN = 日期没法解析）。
  */
  const countdownText = days === 0 ? '就是今天' : days < 0 ? '已经去过啦' : null;


  switch (screen) {
    case 'seal':
      /*
        第一屏是**一个信封**，不是一枚孤零零的火漆。

        用户给的思路：「邀请页面是一个信封，然后在那个信封的中间三角形那一块
        盖一个章子。这个章子要有四个风格的，然后就是做一个展开信封的动作，
        从里面掏出来一张纸 —— 这就是一个页面。」

        所以这一屏的舞台是：信封主体 + 里头的纸露出一角 + **尖朝下的三角形翻盖**，
        章就盖在翻盖正中（火漆的四套形状和材质之前已经做好了，直接搬进来）。
      */
      return (
        <>
          <div className="envelope" aria-hidden="true">
            {/* 信封主体 */}
            <span className="env-body" />

            {/* 三片折角：左右 + 底。有了它们，那个矩形才像一只信封 */}
            <span className="env-fold env-fold-l" />
            <span className="env-fold env-fold-r" />
            <span className="env-fold env-fold-bottom" />

            {/* 三角形翻盖（尖朝下） */}
            <span className="env-flap" />

            {/*
              ⚠️ 章必须在翻盖**外面**，而且排在它后面。

              用户发的实机截图里，章子是**缺的**（一个下缘被切成 V 形的红块）——
              因为它原来写在 <span className="env-flap"> 里面，
              而翻盖有 clip-path: polygon(0 0, 100% 0, 50% 58%)，
              **章被那道裁切一起切掉了**。

              火漆是盖在折口上的、是压在翻盖**上面**的一坨蜡，
              它天然就该比翻盖高一层、并且不被翻盖的形状约束。
              所以移出来做兄弟节点，用 z-index 压住翻盖。
            */}
            <span className="invite-seal">
              <span className="invite-seal-wax" />
              <span className="invite-seal-face">{roleEmoji}</span>
              <span className="invite-seal-rim" />
            </span>
          </div>
          <p className="screen-kicker">有一封邀请</p>
          <h1 className="screen-question">拆开看看？</h1>
        </>
      );

    case 'who':
      return (
        <>
          <span className="screen-emoji">{roleEmoji}</span>
          <p className="screen-kicker">这一封是给你的</p>
          <p className="screen-hand">{fillInviteName(invite.greeting, invite.inviteeName)}</p>
          {/*
            专属感 —— 而且**只在填了名字时才说**。

            没填名字的就是通用链接（谁点都能看），那时候说"只写给你"是骗人。
            我们只讲真话：这一条的真假完全取决于 inviteeName 有没有值。
            （依据见 docs/EXPERIENCE.md「心理学」那一节。）
          */}
          {invite.inviteeName.trim() !== '' && (
            <p className="screen-exclusive">这一封只写给你一个人</p>
          )}
        </>
      );

    case 'when':
      return (
        <>
          <span className="screen-emoji">🗓️</span>
          <p className="screen-kicker">先把日子定下来</p>
          {/* 带星期 —— 请柬一定写，不然收的人不知道该不该请假 */}
          <p className="screen-big reveal-line">{fullDate(invite.date)}</p>
          {invite.timeText !== '' && <p className="screen-hand reveal-line">{invite.timeText}</p>}

          {/*
            **倒计时**，而且数字是滚上去的。
            这是网易云年度总结的招牌 —— 作用不是好看，是**引导视线**：
            静止的数字一眼扫过，正在涨的数字你会盯着它涨完。
          */}
          {Number.isNaN(days) ? null : (
            <div className={days < 0 ? 'countdown countdown-past reveal-line' : 'countdown reveal-line'}>
              {days > 0 ? (
                <>
                  <span className="countdown-num">
                    <CountUp target={days} unit="天" />
                  </span>
                  <span className="countdown-label">距见面还有</span>
                </>
              ) : (
                <>
                  <span className="countdown-num">{countdownText}</span>
                  <span className="countdown-label">{days === 0 ? '就是今天' : '这一天已经过去了'}</span>
                </>
              )}
            </div>
          )}
        </>
      );

    case 'where':
      return (
        <>
          <span className="screen-emoji">📍</span>
          <p className="screen-kicker">在哪儿见</p>
          {/*
            地点做成**可点**的，跳高德搜这个地址。
            收到请柬的人真正需要的不是"看见地名"，是"怎么去" ——
            这既是实用，也是真实感：它不只是一张图，是能用的。
          */}
          {invite.place === '' ? (
            <p className="screen-big">（还没定）</p>
          ) : (
            <p className="screen-big">
              <a className="place-link" href={mapSearchUrl(invite.place)} target="_blank" rel="noreferrer">
                {invite.place}
              </a>
            </p>
          )}
        </>
      );

    case 'what':
      return (
        <>
          <span className="screen-emoji">🎯</span>
          <p className="screen-kicker">干嘛去</p>
          <p className="screen-big">{invite.activity || '（没写，去了就知道）'}</p>
        </>
      );

    case 'word':
      return (
        <>
          <p className="screen-kicker">还有几句话</p>
          {invite.body.trim() !== '' && <p className="screen-body">{invite.body}</p>}
          <p className="screen-sign">{invite.signature}</p>
          <p className="screen-kicker">—— {invite.title}</p>
        </>
      );

    case 'card':
      /*
        一张正式的请柬。
        前面几屏是**吊着看**（一页一件事），这一屏是**收拢** ——
        时间 / 地点 / 事由 / 邀请人四样齐了，收到的人一眼就知道：
        什么事、什么时候、在哪儿、谁请的。这是「信息量明确」那一半。
      */
      return (
        <article className="icard">
          <header className="icard-head">
            <span className="icard-mark">{roleEmoji}</span>
            <span className="icard-title">邀 请 函</span>
            <span className="icard-rule" />
          </header>

          <dl className="icard-rows">
            <div className="icard-row">
              <dt>时间</dt>
              <dd className="icard-strong">
                {fullDate(invite.date)}
                {invite.timeText === '' ? '' : ` ${invite.timeText}`}
              </dd>
            </div>
            <div className="icard-row">
              <dt>地点</dt>
              <dd className="icard-strong">
                {invite.place === '' ? (
                  '（没写，到时候说）'
                ) : (
                  <a className="place-link" href={mapSearchUrl(invite.place)} target="_blank" rel="noreferrer">
                    {invite.place}
                  </a>
                )}
              </dd>
            </div>
            <div className="icard-row">
              <dt>事由</dt>
              <dd>{invite.activity || '（没写，去了就知道）'}</dd>
            </div>
            <div className="icard-row">
              <dt>邀请</dt>
              <dd>{hostName}</dd>
            </div>
          </dl>

          <footer className="icard-foot">
            <span className="icard-foot-text">届时恭候，不见不散</span>
            <span className="icard-sign">{hostName} 敬邀</span>
          </footer>
        </article>
      );

    case 'answer':
      return (
        <>
          <p className="screen-kicker">所以，去不去？</p>
          <Answer
            invite={invite}
            hostGender={hostGender}
            onAnswer={onRespond}
          />
        </>
      );

    case 'chat':
    default:
      return (
        <Chat
          code={invite.code}
          messages={messages}
          onSent={onMessages}
        />
      );
  }
}

/* ==========================================================================
   「不允许拒绝」的完整编排：走 → 抓 → 举 → 团 → 扔 → 拉大 → 坐 → 指
   ========================================================================== */

type Act = 'idle' | 'walk' | 'reach' | 'grab' | 'crumple' | 'throw' | 'grow' | 'sit' | 'point';

const SCRIPT: ReadonlyArray<readonly [Act, number]> = [
  ['walk', 60],
  ['reach', 1150],
  ['grab', 1600],
  ['crumple', 2150],
  ['throw', 2700],
  ['grow', 3600],
  ['sit', 4350],
  ['point', 5150],
];

const AT_NO_BUTTON: ReadonlySet<Act> = new Set<Act>(['walk', 'reach', 'grab', 'crumple', 'throw']);

function moodFor(act: Act): PuppetMood {
  switch (act) {
    case 'walk':
      // **跑**过去抢 —— 走太温吞了，和「一把抓走」这个动作不搭
      return 'run';
    case 'reach':
    case 'grab':
      return 'reach';
    case 'crumple':
    case 'throw':
      return 'throw';
    case 'grow':
      return 'grow';
    case 'sit':
      return 'sit';
    case 'point':
      return 'point';
    default:
      return 'idle';
  }
}

function Answer({
  invite,
  hostGender,
  onAnswer,
}: {
  invite: Invite;
  hostGender: 'male' | 'female';
  onAnswer: (status: 'accepted' | 'declined') => void;
}) {
  const [act, setAct] = useState<Act>('idle');
  const [pupX, setPupX] = useState(0);
  /*
    竖直方向的偏移。

    ⚠️ 为什么要有它：退场不能靠 CSS 的 position: fixed ——
    小人的祖先里有带 transform 的元素，而**有 transform 的祖先会成为
    fixed 的包含块**，于是它根本到不了视口左上角（实测停在"左50 上269"）。
    所以位置一律由 JS 量、用 transform 推，跟祖先无关。
  */
  const [pupY, setPupY] = useState(0);
  /**
   * 婉拒按钮是不是已经被扔掉了。
   * 为什么要单独记：`crumpled`/`thrown` 是按**当前这一步**挂的，
   * 走到下一步就没了 —— 按钮会自己长回来（实测真出现过）。扔出去就得永久消失。
   */
  const [gone, setGone] = useState(false);

  /*
    演完之后**退场到左上角**。

    用户的原话：「强制要求那个最后牛马应该坐在左上角，
    不应该把中间的汉字给挡住。」

    对 —— 它把「不去」扔了、把「同意」拉大了，然后就一直赖在正中间，
    压着那两个字。**演完就该有分寸地退开** —— 这是角色该有的礼仪。
    所以按钮一稳（gone 之后 2.6 秒），它就飘到左上角变小待着。
  */
  const [docked, setDocked] = useState(false);

  /** 别忘了：这是 `Answer` 里的状态，不是外面那个组件的 —— 放错地方会找不到名字。 */
  useEffect(() => {
    if (!gone) return;
    const away = window.setTimeout(() => setDocked(true), 2600);
    return () => window.clearTimeout(away);
  }, [gone]);

  /**
   * 退场：把小人推到**视口左上角**。
   *
   * 量的是"小人现在在哪、要挪多少才能到左上角"，然后用 transform 推过去 ——
   * 这样不管祖先有没有 transform 都对。
   */
  useEffect(() => {
    if (!docked) return;
    const holder = puppetRef.current;
    if (holder === null) return;
    const box = holder.getBoundingClientRect();
    // 目标：左上角留 12px 边距
    setPupX((current) => current + (12 - box.left));
    setPupY(14 - box.top);
  }, [docked]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  /** 小人容器 —— 退场时要量它的位置。 */
  const puppetRef = useRef<HTMLDivElement | null>(null);
  const noRef = useRef<HTMLButtonElement | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = (): void => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  /*
    ⚠️ 这条只在「婉拒按钮还在」时才有意义。
    一旦它被扔掉、位置收掉，剩下的按钮一定是居中的 ——
    那时偏移就该是 0，不要去量。
    **能用结构保证的事，不要靠测量**：舞台宽度本身会随按钮收缩而变，
    量的时机偏一点就对不上（实测差 95px）。
  */
  const placeAt = useCallback((which: 'no' | 'yes') => {
    const stage = stageRef.current;
    const target = which === 'no' ? noRef.current : yesRef.current;
    if (stage === null || target === null) return;
    const s = stage.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    setPupX(t.left - s.left + t.width / 2 - 80);
  }, []);

  useEffect(() => {
    if (act === 'idle') return;
    /*
      ⚠️ 这里必须**先看 gone**，两个 effect 才会说同一句话。

      踩过的坑：我另写了一个"按钮收完之后归零"的 effect，
      但这条 effect 会在 act 变化时（sit → point）重新算一遍偏移，
      **把归零覆盖回去** —— 实测小人中心 310、按钮中心 215，差 95px。
      两个 effect 抢同一个状态，谁后跑谁说了算，这种 bug 最难查。
    */
    if (gone) {
      setPupX(0);
      return;
    }
    placeAt(AT_NO_BUTTON.has(act) ? 'no' : 'yes');
  }, [act, gone, placeAt]);

  const play = (): void => {
    clearTimers();
    for (const [step, at] of SCRIPT) {
      timers.current.push(window.setTimeout(() => setAct(step), at));
    }
    timers.current.push(window.setTimeout(() => setGone(true), 3400));
  };

  if (invite.status !== 'pending') {
    return (
      <div className="invite-answered">
        {/*
          答应之后它得有个反应 —— 光换一行字太冷了。
          「不许拒绝」那条线上尤其需要：折腾了那么久把人抢过来，总得高兴一下。
        */}
        <div className="answered-puppet">
          <Puppet gender={hostGender} mood="cheer" />
        </div>
        <span className="invite-answered-emoji">
          {invite.status === 'accepted' ? '🎉' : '😔'}
        </span>
        <p className="invite-answered-title">
          {invite.status === 'accepted' ? '好的，就这么定了' : '这次先不去了'}
        </p>
        <p className="invite-answered-hint">
          {invite.status === 'accepted' ? '到时候见。' : '想改主意的话，点下面。'}
        </p>
        <button
          type="button"
          className="invite-btn invite-btn-ghost"
          onClick={() => onAnswer(invite.status === 'accepted' ? 'declined' : 'accepted')}
        >
          改成{invite.status === 'accepted'
            ? `「${ANSWER_WORDS[invite.role].no}」`
            : `「${ANSWER_WORDS[invite.role].yes}」`}
        </button>
      </div>
    );
  }

  const crumpled = act === 'crumple' || act === 'throw';
  const seated = act === 'sit' || act === 'point';

  return (
    <div className="invite-answer">
      <div className="invite-stage" ref={stageRef}>
        {/*
          这块 148px 是给小人抢按钮留的站位，可小人一开始并不在场 ——
          空着的时候整张回答卡像没做完（逐张截图看出来的）。
          所以先在这里放一份"去哪儿、什么时候"的回执摘要：
          好友不用翻回前面几屏就能做决定。小人一进场它就淡掉让位。
        */}
        <div className="answer-recap">
          <div className="answer-recap-row">
            <span className="answer-recap-k">时间</span>
            <span className="answer-recap-v">
              {fullDate(invite.date)}
              {invite.timeText === '' ? '' : ` ${invite.timeText}`}
            </span>
          </div>
          <div className="answer-recap-row">
            <span className="answer-recap-k">地点</span>
            <span className="answer-recap-v">
              {invite.place === '' ? '（没写，到时候说）' : invite.place}
            </span>
          </div>
          <div className="answer-recap-row">
            <span className="answer-recap-k">事由</span>
            <span className="answer-recap-v">{invite.activity || '（没写，去了就知道）'}</span>
          </div>
        </div>

        {invite.noDecline && act !== 'idle' && (
          <div
            ref={puppetRef}
            className={docked ? 'invite-puppet-holder puppet-docked' : 'invite-puppet-holder'}
            style={{ transform: `translate(${pupX}px, ${pupY}px)` }}
          >
            {/* 退场之后是**坐在**左上角的 —— 用户说的就是"坐在左上角" */}
            <Puppet gender={hostGender} mood={docked ? 'sit' : moodFor(act)} />
          </div>
        )}

        <div className="invite-buttons">
          <button
            type="button"
            ref={noRef}
            className={[
              'invite-btn',
              'invite-btn-no',
              gone ? 'invite-btn-gone' : '',
              crumpled ? 'invite-btn-crumpled' : '',
              act === 'grab' ? 'invite-btn-lifted' : '',
              act === 'throw' ? 'invite-btn-thrown' : '',
            ]
              .filter((item) => item !== '')
              .join(' ')}
            onClick={() => {
              if (invite.noDecline) {
                play();
                return;
              }
              onAnswer('declined');
            }}
          >
            {ANSWER_WORDS[invite.role].no}
          </button>

          <button
            type="button"
            ref={yesRef}
            className={`invite-btn invite-btn-yes ${seated ? 'invite-btn-seated' : ''}`}
            style={act === 'grow' || seated ? { transform: 'scale(1.28)' } : undefined}
            onClick={() => onAnswer('accepted')}
          >
            {ANSWER_WORDS[invite.role].yes} →
          </button>
        </div>
      </div>

      {invite.noDecline && (
        <p className="invite-locked-hint">
          这份邀请<strong>不接受婉拒</strong> —— 小牛马已经把「
          {ANSWER_WORDS[invite.role].no}」抓走扔了。
        </p>
      )}
    </div>
  );
}

/** 对话区。**这个功能的重点** —— 定下来之后还要来回商量。 */
function Chat({
  code,
  messages,
  onSent,
}: {
  code: string;
  messages: InviteMessage[];
  onSent: (messages: InviteMessage[]) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = listRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  const send = (): void => {
    if (text.trim() === '') return;
    setBusy(true);
    void api
      .sendInviteMessage(code, text)
      .then((result) => {
        onSent(result.messages);
        setText('');
        setError(null);
      })
      .catch((cause: unknown) => setError(describeError(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="invite-chat">
      <h2 className="invite-chat-title">说两句</h2>
      <p className="invite-chat-hint">
        几点到、要不要带伞、想吃什么 —— 都在这儿说，牛马看得到。
      </p>

      {messages.length > 0 && (
        <div className="invite-chat-list" ref={listRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.from === 'host'
                  ? 'invite-chat-msg invite-chat-host'
                  : 'invite-chat-msg invite-chat-guest'
              }
            >
              <span className="invite-chat-who">{message.from === 'host' ? '牛马' : '我'}</span>
              <span className="invite-chat-text">{message.text}</span>
            </div>
          ))}
        </div>
      )}

      {error !== null && <p className="invite-chat-error">{error}</p>}

      <form
        className="invite-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          className="invite-chat-input"
          value={text}
          placeholder="说点什么…"
          maxLength={800}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="submit"
          className="invite-btn invite-btn-send"
          disabled={busy || text.trim() === ''}
        >
          发送
        </button>
      </form>
    </section>
  );
}

/* ==========================================================================
   看全部：**同一套卡片依次摊开**
   --------------------------------------------------------------------------
   以前这里是一张「信纸长卷」，和分镜那套是两种视觉 —— 同一个功能两套皮，不统一。
   现在改成把上面那几屏**原样摞起来**：视觉一模一样，只是不用一页页点。
   这样「赶时间」和「慢慢看」看到的是同一个东西，只是节奏不同。
   ========================================================================== */

function LetterAll({
  invite,
  roleEmoji,
  hostName,
  hostGender,
  messages,
  onRespond,
  onMessages,
  onBack,
}: {
  invite: Invite;
  roleEmoji: string;
  hostName: string;
  hostGender: 'male' | 'female';
  messages: InviteMessage[];
  onRespond: (status: 'accepted' | 'declined') => void;
  onMessages: (messages: InviteMessage[]) => void;
  onBack: () => void;
}) {
  /** 前面几屏是纯展示，直接摞起来。 */
  // 摊开看的时候不含「请柬」那一屏 —— 它是收拢，和上面几张重复
  const plain: Screen[] = ['seal', 'who', 'when', 'where', 'what', 'word'];

  return (
    <div className="invite-all">
      {plain.map((item) => (
        <section key={item} className={`all-card all-card-${item}`}>
          <div className="screen-inner">
            <ScreenBody
              screen={item}
              invite={invite}
              roleEmoji={roleEmoji}
              hostName={hostName}
              hostGender={hostGender}
              messages={messages}
              onRespond={onRespond}
              onMessages={onMessages}
            />
          </div>
        </section>
      ))}

      {/* 回答和对话放在同一张卡上：摊开看的人图省事，少翻一次 */}
      <section className="all-card all-card-final">
        <div className="screen-inner">
          <p className="screen-kicker">所以，去不去？</p>
          <Answer invite={invite} hostGender={hostGender} onAnswer={onRespond} />
          <Chat code={invite.code} messages={messages} onSent={onMessages} />
        </div>
      </section>

      <nav className="step-nav">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← 回到一页一页看
        </button>
      </nav>
    </div>
  );
}
