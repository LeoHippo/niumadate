import { createContext, useContext } from 'react';
import type { AppConfig } from '@niumadate/shared';

/** 公开配置在 App 里拉一次，所有页面共用。 */
export const ConfigContext = createContext<AppConfig | null>(null);

export function useConfig(): AppConfig {
  const value = useContext(ConfigContext);
  if (value === null) throw new Error('配置还没加载完');
  return value;
}
