import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * 后台口令从哪来。
 *
 *   1. 环境变量 `ADMIN_PASSWORD`
 *   2. `apps/server/data/admin-password` —— 服务端第一次启动时随机生成的那个
 *   3. 都没有就**直接报错**，别默默用一个猜的口令
 *
 * 第 3 条很重要：以前这里写死 `niuma-dev`。服务端现在不给默认值了，
 * 猜错口令的结果是一串看不懂的 401，还不如当面说「找不到口令」。
 */
export function resolveAdminPassword() {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;

  const file = resolve(here, '../apps/server/data/admin-password');
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim();
    if (stored !== '') return stored;
  }

  throw new Error(
    [
      '找不到后台口令，冒烟跑不下去。',
      '',
      '  服务端第一次启动时会随机生成一个，存在：',
      '    apps/server/data/admin-password',
      '',
      '  也可以显式给：',
      '    $env:ADMIN_PASSWORD="你的口令"; pnpm smoke',
    ].join('\n'),
  );
}
