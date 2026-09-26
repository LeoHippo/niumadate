import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Puppet } from '../puppet';
import { BURST_PIECES } from '../burst';
import { ROLE_EMOJI, ROLE_LABEL } from '../role-emoji';
import type { RoleKey } from '@niumadate/shared';
import '../motion-lab.css';
import '../lab-3d.css';
import '../lab-fix.css';
/* lab-fix2 / lab-fix3 已摘掉：还需要的东西（05/06/07 纸时间表）搬进了 lab-scenes.css，
   其余的和 lab-fix.css 重复或被它覆盖。四层互相覆盖是「dev 好看、线上不一样」的根源。 */
import '../lab-scenes.css';

/**
 * 动效实验室（/dev/motion）
 *
 * 用户给的方法：「你可以单独把每一个动画先设计出来，然后用页面展示一下，
 * 最后再统一合并起来。」—— 这是对的，而且正好解决我一直以来的困难：
 *
 * 在**整条流程里**看单个动画，时机根本掐不准（前一屏要等、后一屏要来、
 * 逐句浮现还要两秒才停），所以我一次次截到动画演到一半的帧，一次次下错结论。
 *
 * 这个页面把每个动画单独拆出来：一张卡片、一个重播按钮、一个速度滑杆。
 * 用的都是**线上同一套 class**，所以这里看到什么，线上就是什么。
 * 它不在任何导航里，只能靠 URL 进，也不影响好友看到的页面。
 */

const SPEEDS = [0.25, 0.5, 1, 2];

/* 身份 emoji / 中文名和线上共用一份（src/role-emoji.ts），改一处两边都变 */

export function MotionLab() {
  const [speed, setSpeed] = useState(1);
  const [round, setRound] = useState(0);
  const [gender, setGender] = useState('male');
  // 身份用 RoleKey 而不是 string：这样 ROLE_EMOJI[theme] 才查得到，
  // 少一个身份也会在编译期报出来，而不是运行时显示成 🐮 兜底图。
  const [theme, setTheme] = useState<RoleKey>('baby');

  return (
    <div className="lab" data-theme={theme}>
      <header className="lab-head">
        <h1>动效实验室</h1>
        <p className="lab-sub">
          每个动画单独一张卡。点全部重播看一遍，把速度调到 0.25 倍慢慢细看。
          这里用的是线上同一套样式，所以看到什么，线上就是什么。
        </p>

        <div className="lab-controls">
          <label>
            速度
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s} 倍
                </option>
              ))}
            </select>
          </label>

          <label>
            身份
            <select value={theme} onChange={(e) => setTheme(e.target.value as RoleKey)}>
              <option value="brother">好兄弟</option>
              <option value="sister">好姐妹</option>
              <option value="baby">好宝宝</option>
              <option value="dadmam">DAD 和 MUM</option>
            </select>
          </label>

          <label>
            小人
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="male">男版</option>
              <option value="female">女版</option>
            </select>
          </label>

          <button type="button" className="lab-replay" onClick={() => setRound((n) => n + 1)}>
            全部重播
          </button>
        </div>
      </header>

      <main className="lab-grid" style={{ ['--lab-speed' as string]: String(speed) }}>
        <Card title="01 信封落下" note="第一眼看到的动作：从上面落下来，回弹一下，稳住。1.4 秒。">
          <div className="lab-stage lab-stage-tall">
            <div className="envelope" key={'env' + round}>
              <span className="env-body" />
              <span className="env-fold env-fold-l" />
              <span className="env-fold env-fold-r" />
              <span className="env-fold env-fold-bottom" />
              {/*
                翻盖分两层：外层只转（rotateX），内层只裁（clip-path）。
                上一轮我把两者放在同一个元素上，clip-path 在 2D 平面裁剪，
                元素绕 X 转过去之后裁剪形状不跟着变 —— "翻开"在视觉上完全没发生。
                当时我的处理是"把 3D 撤掉"，结果是不打架了、也没立体感了。
                分开给两个元素才是正解。
              */}
              <span className="env-flap3d">
                <span className="env-flap" />
              </span>
              <span className="invite-seal">
                <span className="invite-seal-wax" />
                {/* 按身份取 emoji —— 之前这里写死了 🍻，所以四个身份一模一样 */}
                <span className="invite-seal-face">{ROLE_EMOJI[theme] ?? '🐮'}</span>
                <span className="invite-seal-rim" />
              </span>
            </div>
          </div>
        </Card>

        <Card
          title="02 火漆消失（四种）"
          note="同一张时间轴（4.2 秒）横着看：兄弟原地淡掉、微微下沉；姐妹转开缩小、花瓣被风吹散；宝宝先绽开一下再炸成满天转着圈的花；家人从正中裂开、两半垂直落下。"
        >
          <div className="lab-stage lab-stage-tall">
            <div className="lab-seal-row">
              {/*
                ⚠️ 这里原来是 data-theme={r}，而实验室根节点上也挂着 data-theme
                （身份选择器）。后代选择器 [data-theme='baby'] .lab-seal-cell
                会匹配**任意祖先**，于是"宝宝"那套动画套在了全部四格上 ——
                实测四个章的 animation-name 全是 seal-baby-bloom。
                换成 data-role，和主题彻底切开。
              */}
              {(['brother', 'sister', 'baby', 'dadmam'] as const).map((r) => (
                <div className="lab-seal-cell" key={r + round} data-role={r}>
                  <div className="mv-seal-stage">
                    <span className="mv-flash" />
                    <span className="mv-seal-body">
                      <span className="op-env-seal lab-seal-big">
                        <span className="mv-seal-face">{ROLE_EMOJI[r]}</span>
                      </span>
                      <span className="mv-crack" />
                    </span>
                    {Array.from({ length: 8 }, (_, i) => (
                      <i className="mv-dust" key={i} style={{ ['--i' as string]: String(i) }} />
                    ))}
                  </div>
                  <span className="lab-seal-name">{ROLE_LABEL[r]}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="03 翻盖抬走，纸冒出来" note="翻盖往上让开，纸从信封口冒出来，然后一边被抽一边长大。">
          <div className="lab-stage lab-stage-tall">
            {/*
              ⚠️ 这里原来写的是 .op-env-flap，而翻盖的动画挂在 .env-flap3d 上 ——
              **选择器根本没匹配**，所以这张卡的翻盖一直不翻（实测 getComputedStyle
              查 .env-flap3d 得到"没有"）。改成和 01 卡同一套 3D 结构。
            */}
            <div className="lab-env-wrap" key={'rise' + round}>
              <span className="op-env-body" />
              <span className="op-env-fold op-env-fold-l" />
              <span className="op-env-fold op-env-fold-r" />
              {/* 纸：一开始**藏在信封里**（top 在信封内），翻盖让开之后才往上冒 */}
              <span className="op-env-paper" />
              <span className="env-flap3d">
                <span className="env-flap" />
              </span>
            </div>
          </div>
        </Card>

        <Card title="04 小人走进来" note="从屏幕左边一路走进画面，停在信封左下方。">
          <div className="lab-stage lab-stage-tall">
            <div className="op-puppet lab-puppet-static" key={'walk' + round}>
              <Puppet gender={gender as 'male' | 'female'} mood="run" />
            </div>
          </div>
        </Card>

        <Card title="05 小人拉纸，很费劲" note="关键在前两次使劲纸纹丝不动。那才叫拉不动，一路滑出去不叫。">
          <div className="lab-stage lab-stage-tall lab-stage-motion">
            <div className="lab-paper-demo" key={'pull' + round}>
              <div className="lab-demo-paper pull-demo" />
              <div className="op-puppet lab-puppet-pull">
                <Puppet gender={gender as 'male' | 'female'} mood="pull" />
              </div>
            </div>
          </div>
        </Card>

        <Card title="06 小人压纸" note="从屏幕上方落下来，压扁，弹回一点，再压，最后压到底。">
          <div className="lab-stage lab-stage-tall lab-stage-motion">
            <div className="lab-paper-demo" key={'press' + round}>
              <div className="lab-demo-paper press-demo" />
              <div className="op-puppet lab-puppet-press">
                <Puppet gender={gender as 'male' | 'female'} mood="press" />
              </div>
            </div>
          </div>
        </Card>

        <Card title="07 小人抛纸" note="拎起来，拎不动放下，再拎，半空顿一下，最后甩出去。">
          <div className="lab-stage lab-stage-tall lab-stage-motion">
            <div className="lab-paper-demo" key={'fly' + round}>
              <div className="lab-demo-paper fly-demo" />
              <div className="op-puppet lab-puppet-fly">
                <Puppet gender={gender as 'male' | 'female'} mood="fly" />
              </div>
            </div>
          </div>
        </Card>

        <Card title="08 逐句浮现" note="一屏里的几行按次序出现，一行 1.15 秒，间隔 190 毫秒。">
          <div className="lab-stage">
            <div className="lab-lines" key={'lines' + round}>
              <span className="screen-kicker">先把日子定下来</span>
              <p className="screen-big">2026 年 12 月 25 日（周五）</p>
              <p className="screen-hand">晚上七点半</p>
              <p className="screen-exclusive">这一封只写给你一个人</p>
            </div>
          </div>
        </Card>

        <Card title="09 鎏金" note="12 秒一轮慢慢走。要慢到像光从纸上走过，而不是在闪。">
          <div className="lab-stage">
            <p className="screen-big lab-foil">2026 年 12 月 25 日</p>
          </div>
        </Card>

        <Card title="10 纸的质感" note="比背景亮的纸色，看得见的边，三层影，极淡的纸纹。">
          <div className="lab-stage lab-stage-paper">
            <div className="screen-inner lab-paper-sample">
              <span className="screen-emoji">🥰</span>
              <p className="screen-kicker">这一封是给你的</p>
              <p className="screen-hand">小美，</p>
            </div>
          </div>
        </Card>

        <Card
          wide
          title="11 答应的爆发"
          note="按下「同意」那一下。四套身份爆的东西不一样：兄弟是火花，姐妹是珠光雨，宝宝是爱心加星光，家人是一枚方方正正的红印压下来。上面选身份可以当场换。"
        >
          <div className="lab-stage lab-stage-burst">
            {/*
              ⚠️ 两处漏掉的东西，这就是用户说"完全没有"的原因：
              ① 这里原来**没有 .burst-<role> 这一层** —— 线上四条按身份定制的规则
                 （.burst-brother / .burst-sister / .burst-baby / .burst-dadmam）
                 一条都没生效，四个身份全是那个默认的粉色小片。
              ② 卡片只有 320px 宽，而 .burst-bit 的位移是 ±400px（线上是整屏 fixed）——
                 绝大多数碎片直接飞出卡片、被 .lab-stage 的 overflow:hidden 裁掉。
              所以这张卡改成通栏 + 880px 的大舞台。
            */}
            <div className={'lab-burst burst-' + theme} key={'burst' + round}>
              <span className="burst-flash" />
              <span className="burst-ring" />
              {theme === 'dadmam' ? (
                <span className="burst-stamp">同意</span>
              ) : (
                BURST_PIECES.slice(0, theme === 'brother' ? 40 : theme === 'sister' ? 48 : 60).map(
                  (p, i) => (
                    <span
                      key={i}
                      className={'burst-bit burst-bit-' + (i % 10)}
                      style={
                        {
                          ['--dx' as string]: p.dx,
                          ['--dy' as string]: p.dy,
                          ['--rot' as string]: p.rot,
                          animationDelay: p.delay,
                        } as CSSProperties
                      }
                    />
                  ),
                )
              )}
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

function Card({
  title,
  note,
  children,
  wide,
}: {
  title: string;
  note: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={wide ? 'lab-card lab-card-wide' : 'lab-card'}>
      <h2 className="lab-card-title">{title}</h2>
      <p className="lab-card-note">{note}</p>
      {children}
    </section>
  );
}