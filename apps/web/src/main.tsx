import { Component, StrictMode } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { applyMotionParam } from './motion-param';

/*
  ⚠️ 必须在 <App /> 渲染之前调用 —— 它给 body 打一个 data-motion 标记，
  CSS 靠这个标记决定走"完整动画"还是"减弱版"。
*/
applyMotionParam();
import './styles.css';
import './progress-role.css';
import './selection-role.css';
import './reveal.css';
import './type-scale.css';
import './motion-floor.css';
import './screen-stage.css';
import './foil.css';
/*
  ⚠️ puller-choreography.css **不在这里**导入。

  它是分镜（关键帧重定义），必须排在 invite-motion.css **之后**才生效；
  而 invite-motion.css 是 pages/Invite.tsx 导入的 —— 打包后组件样式
  排在 main.tsx 的样式之后。我第一版就放在这里，结果旧分镜把它盖掉了：
  实测页面位移是一条平滑加速曲线，完全没有"顿住"的平台期，
  精心设计的分镜根本没让人看到（用户那句"设计不让人看到就等于没设计"）。
  现在改到 Invite.tsx 里、紧跟在 invite-motion.css 后面导入。
*/

/**
 * 兜底错误边界。
 *
 * React 里只要渲染时抛一次异常，默认结果是**整棵树卸载 → 一整片白屏**。
 * 好友在手机上看到白屏，只会以为你发的链接是坏的，不会来告诉你。
 *
 * 这个 bug 真的发生过：手机上 localStorage 被禁用时会抛异常，
 * 而入口页不碰存储、点进「选日期」那页才碰 —— 现象就是
 * 「首页能开，选完角色就白屏」。
 *
 * 现在不管哪里崩，至少能看到一句人话 + 一个刷新按钮，
 * 而且技术细节会进控制台，方便排查。
 */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[niumadate] 页面崩了：', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="boot">
          <p className="boot-title">页面出了点问题</p>
          <p className="boot-detail">刷新一下通常就好了。</p>
          <p className="boot-detail">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                window.location.reload();
              }}
            >
              刷新
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('找不到 #root 挂载点');

// 清掉 index.html 里那段「正在打开…」的兜底内容。
// 显式清一次，别指望 React 一定替我们清 —— 留着会出现两份内容。
container.textContent = '';

createRoot(container).render(
  <StrictMode>
    <Boundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Boundary>
  </StrictMode>,
);
