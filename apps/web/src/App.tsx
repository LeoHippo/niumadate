import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '@niumadate/shared';
import { api, describeError } from './api';
import { ConfigContext } from './config-context';
import './theme-shapes.css';
import './motion-tokens.css';
import { AdminPage } from './pages/Admin';
import { BookingPage } from './pages/Booking';
import { EntryPage } from './pages/Entry';
import { InvitePage } from './pages/Invite';
import { MinePage } from './pages/Mine';
import { StatusPage } from './pages/Status';

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const loaded = await api.getConfig();
        if (alive) setConfig(loaded);
      } catch (cause) {
        if (alive) setError(describeError(cause));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error !== null) {
    // 技术细节只进控制台。**好友不该看到开发者的话** ——
    // 以前这里写着「后端起了吗？本地开发要先跑 pnpm dev」，
    // 好友在手机上看到这句只会一脸懵，还以为自己操作错了。
    console.error('[niumadate] 加载配置失败：', error);
    return (
      <div className="boot">
        <p className="boot-title">暂时连不上</p>
        <p className="boot-detail">网络好像不太顺 —— 下拉刷新一下试试。</p>
        <p className="boot-detail">要是还不行，过一会儿再来，或者直接微信问牛马。</p>
      </div>
    );
  }

  if (config === null) {
    return (
      <div className="boot">
        <p className="boot-title">牛马正在赶来……</p>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      <Routes>
        <Route path="/" element={<EntryPage />} />
        <Route path="/mine" element={<MinePage />} />
        {/*
          ⚠️ 这条必须放在兜底路由 "*" **前面**，否则会被它吃掉、落回首页。
          邀请页不需要登录 —— 链接里那串码本身就是凭据。
        */}
        <Route path="/i/:code" element={<InvitePage />} />
        <Route path="/date/:role" element={<BookingPage />} />
        <Route path="/status/:role" element={<StatusPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConfigContext.Provider>
  );
}
