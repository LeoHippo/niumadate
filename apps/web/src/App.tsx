import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '@niumadate/shared';
import { api, describeError } from './api';
import { ConfigContext } from './config-context';
import { AdminPage } from './pages/Admin';
import { BookingPage } from './pages/Booking';
import { EntryPage } from './pages/Entry';
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
    return (
      <div className="boot">
        <p className="boot-title">配置加载失败</p>
        <p className="boot-detail">{error}</p>
        <p className="boot-detail">后端起了吗？本地开发要先跑 pnpm dev。</p>
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
        <Route path="/date/:role" element={<BookingPage />} />
        <Route path="/status/:role" element={<StatusPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConfigContext.Provider>
  );
}
