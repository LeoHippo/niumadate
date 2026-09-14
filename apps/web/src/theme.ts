import { useEffect } from 'react';
import type { ThemeKey } from '@niumadate/shared';

/**
 * 把主题挂到 `<html>` 上。
 *
 * 元素级的 `data-theme` 只能影响它自己的子树；而页面底色、`body` 的纹理
 * 在 `<html>` 这一层，靠子树选择器够不着。所以进页面时单独挂一次，
 * 离开时摘掉，免得主题串到别的页面去。
 */
export function usePageTheme(theme: ThemeKey | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === undefined) {
      delete root.dataset.theme;
      return;
    }

    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);
}
