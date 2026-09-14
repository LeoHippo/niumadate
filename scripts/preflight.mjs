/**
 * 上线前的预检。
 *
 * 本地跑得再好，部署时踩的坑往往是另一批：忘了构建、环境变量没设、
 * 数据目录不可写、端口被占。这个脚本把这些一次性查完，输出 go / no-go。
 *
 * 用法：node scripts/preflight.mjs
 */
import { existsSync, readFileSync, statSync, accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = process.env.PREFLIGHT_API ?? 'http://127.0.0.1:8787/api';

const results = [];
const ok = (name, detail = '') => results.push({ level: 'ok', name, detail });
const warn = (name, detail = '') => results.push({ level: 'warn', name, detail });
const bad = (name, detail = '') => results.push({ level: 'bad', name, detail });

// ---------- 1. 运行环境 ----------
const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (major >= 22) ok('Node 版本', process.version);
else bad('Node 版本', `${process.version} —— node:sqlite 需要 22 以上`);

// ---------- 2. 构建产物 ----------
for (const [label, path] of [
  ['前端产物 apps/web/dist/index.html', join(root, 'apps/web/dist/index.html')],
  ['后端产物 apps/server/dist/index.js', join(root, 'apps/server/dist/index.js')],
]) {
  if (existsSync(path)) {
    ok(label, `${Math.round(statSync(path).size / 1024)} KB`);
  } else {
    bad(label, '不存在 —— 先跑 pnpm build');
  }
}

// 静态资源抽查：这几样缺了，分享卡片和图标就废了
for (const asset of ['favicon.svg', 'apple-touch-icon.png', 'manifest.webmanifest']) {
  const path = join(root, 'apps/web/dist', asset);
  if (existsSync(path)) ok(`静态资源 ${asset}`);
  else bad(`静态资源 ${asset}`, '没被拷进 dist —— 检查在不在 apps/web/public 下');
}

// 动画素材
const emojiDir = join(root, 'apps/web/dist/emoji');
if (existsSync(emojiDir)) {
  const files = readFileSync;
  ok('动画素材 emoji/', '已就位');
} else {
  warn('动画素材 emoji/', '没找到 —— 有动画的地方会退回普通 emoji');
}

// ---------- 3. 数据目录 ----------
const dataDir = join(root, 'apps/server/data');
if (existsSync(dataDir)) {
  try {
    accessSync(dataDir, constants.W_OK);
    ok('数据目录可写', dataDir);
  } catch {
    bad('数据目录可写', `${dataDir} 不可写 —— 跑服务的用户没权限`);
  }

  const configPath = join(dataDir, 'config.json');
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
      ok('config.json 能解析', `站点开关：${parsed?.site?.open ? '接单中' : '暂停营业'}`);
      if (parsed?.site?.open === false) {
        warn('站点总开关', '现在是「暂停营业」，好友点进去只会看到卷帘门');
      }
    } catch (cause) {
      bad('config.json 能解析', String(cause));
    }
  } else {
    warn('config.json', '还没有 —— 服务第一次启动会用出厂默认生成');
  }
} else {
  warn('数据目录', '还没建 —— 服务第一次启动会自己建');
}

// ---------- 4. 环境变量 ----------
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminPassword === undefined || adminPassword === '') {
  warn('ADMIN_PASSWORD', '没设 —— 会用开发默认口令，**上线必须设**');
} else if (adminPassword.length < 12) {
  warn('ADMIN_PASSWORD', `只有 ${adminPassword.length} 位，建议 12 位以上`);
} else {
  ok('ADMIN_PASSWORD', '已设置');
}

const origin = process.env.WEB_ORIGIN;
if (origin === undefined || origin === '') {
  warn('WEB_ORIGIN', '没设 —— 跨域限制会用默认值');
} else if (origin.startsWith('http://') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
  warn('WEB_ORIGIN', `是 http：${origin} —— 线上应该用 https`);
} else {
  ok('WEB_ORIGIN', origin);
}

// ---------- 5. 服务真的活着吗 ----------
try {
  const health = await (await fetch(`${api}/health`, { signal: AbortSignal.timeout(4000) })).json();
  ok('服务在跑', `${health.service} 已启动 ${health.uptime} 秒`);

  const config = await (await fetch(`${api}/config`, { signal: AbortSignal.timeout(4000) })).json();
  ok('配置能取到', `${config.roles?.length ?? 0} 个身份`);
  const themeMissing = (config.roles ?? []).filter((role) => role.theme === undefined);
  if (themeMissing.length > 0) {
    warn('身份主题字段', '有身份缺 theme —— 服务是不是还在跑旧包？重启一下');
  }
} catch (cause) {
  warn('服务在跑', `连不上 ${api} —— 如果还没启动服务，这条忽略。(${String(cause).slice(0, 50)})`);
}

// ---------- 汇总 ----------
const icon = { ok: '✅', warn: '⚠️ ', bad: '❌' };
console.log('\n===== 上线预检 =====\n');
for (const item of results) {
  console.log(`${icon[item.level]} ${item.name}${item.detail === '' ? '' : `  —— ${item.detail}`}`);
}

const bads = results.filter((item) => item.level === 'bad').length;
const warns = results.filter((item) => item.level === 'warn').length;
console.log(`\n结论：${bads} 项必须修，${warns} 项建议看看。`);

if (bads > 0) {
  console.log('\n❌ 先别上线，上面标 ❌ 的修完再跑一次。\n');
  process.exit(1);
}
console.log(warns > 0 ? '\n⚠️  没有硬伤，但建议把上面几条过一遍。\n' : '\n✅ 可以上线。\n');
