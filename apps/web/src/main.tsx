import { Component, StrictMode } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';
import './progress-role.css';
import './selection-role.css';

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
