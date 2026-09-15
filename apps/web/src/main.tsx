import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (container === null) throw new Error('找不到 #root 挂载点');

// 清掉 index.html 里那段「正在打开…」的兜底内容。
// 显式清一次，别指望 React 一定替我们清 —— 留着会出现两份内容。
container.textContent = '';

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
