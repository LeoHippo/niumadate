#!/usr/bin/env node
/**
 * 一条命令把前端发到容器里，并且**校验它真的到了**。
 *
 * 为什么必须要有这个脚本（这不是洁癖，是踩过的坑）：
 *   之前我是手写一串命令：build ; cp ; restart ; 'ok'。
 *   有一次 CSS 语法错误让 vite **构建失败**，dist 被清掉、cp 什么也没拷，
 *   但后面那条 'ok' 照样打印 —— 于是我以为发出去了，
 *   而容器里还是**几十分钟前那份旧包**，页面上怎么改都"没生效"。
 *   用户的反馈就是那句：「我看新的好像还不是一样的。」
 *
 *   所以这里每一步都卡死：
 *     1. 构建失败 → 直接退出，绝不继续
 *     2. dist/index.html 不存在 → 退出
 *     3. 拷完之后**把容器里的 index.html 读回来**，和本地 dist 的产物名逐一比对
 *     4. 再对公网（可选）确认一次
 *
 * 用法：node scripts/deploy.mjs [--public]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const PUBLIC = process.argv.includes('--public');
const IMAGE = process.argv.includes('--image');
const DIST_HTML = 'apps/web/dist/index.html';
const CONTAINER = 'niumadate';

function run(cmd, args) {
  process.stdout.write('\n$ ' + cmd + ' ' + args.join(' ') + '\n');
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
}

function assetsOf(html) {
  return [...html.matchAll(/assets\/index-[A-Za-z0-9_-]+\.(?:js|css)/g)].map((m) => m[0]).sort();
}

// ---- 1. 构建（失败就停） ----
run('pnpm', ['-r', 'run', 'build']);

if (!existsSync(DIST_HTML)) {
  console.error('\n✗ 构建之后没有 ' + DIST_HTML + ' —— 发不出去，停。');
  process.exit(1);
}
const localAssets = assetsOf(readFileSync(DIST_HTML, 'utf8'));
if (localAssets.length === 0) {
  console.error('\n✗ dist/index.html 里找不到任何 assets/index-* 产物，停。');
  process.exit(1);
}
console.log('\n本地产物：' + localAssets.join('  '));

// ---- 2. 拷进容器 + 重启 ----
run('docker', ['compose', 'cp', 'apps/web/dist/.', 'app:/app/apps/web/dist/']);
run('docker', ['compose', 'restart', 'app']);

// ---- 3. 等健康检查 ----
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
let healthy = false;
for (let i = 0; i < 40 && !healthy; i++) {
  try {
    const out = execFileSync('curl.exe', ['-s', 'http://127.0.0.1:8787/api/health'], { encoding: 'utf8' });
    if (out.includes('"status":"ok"')) healthy = true;
  } catch {
    /* 还没起来 */
  }
  if (!healthy) sleep(500);
}
if (!healthy) {
  console.error('\n✗ 容器健康检查没通过，停。');
  process.exit(1);
}

// ---- 4. 把容器里的 index.html 读回来比对 ----
const remoteHtml = execFileSync(
  'docker',
  ['compose', 'exec', '-T', 'app', 'cat', '/app/apps/web/dist/index.html'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);
const remoteAssets = assetsOf(remoteHtml);
console.log('\n容器产物：' + remoteAssets.join('  '));

const missing = localAssets.filter((a) => !remoteAssets.includes(a));
if (missing.length > 0) {
  console.error('\n✗ 容器里的 index.html 还是旧包，缺：' + missing.join('  '));
  process.exit(1);
}
console.log('\n✓ 容器里的产物和本地 dist 完全一致。');

// ---- 4b. 清掉容器里累积的旧产物 ----
// docker compose cp **不会删除**目标目录里没被覆盖的文件，所以每发一次就多留一份。
// 刚才实测容器里已经攒了 58 份旧 JS —— 虽然 index.html 指的是新的那份（不影响正确性），
// 但"哪个才是现在跑的"会变得很难查，索性一起清掉。
const keep = new Set(localAssets.map((a) => a.replace('assets/', '')));
try {
  const list = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'app', 'ls', '/app/apps/web/dist/assets'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  )
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '' && !keep.has(s));
  if (list.length > 0) {
    // ⚠️ 不要用 sh -c "cd … && rm …"：经过 shell 转义之后会被拆坏。
    // 直接用绝对路径、一条 rm 命令最稳。
    execFileSync(
      'docker',
      ['compose', 'exec', '-T', 'app', 'rm', '-f',
        ...list.map((n) => '/app/apps/web/dist/assets/' + n)],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );
    console.log('✓ 清掉容器里 ' + list.length + ' 份旧产物。');
  }
} catch (cause) {
  console.log('（清旧产物跳过：' + String(cause).slice(0, 80) + '）');
}

/*
  ---- 4c. 把新产物**烘进镜像**（--image） ----

  为什么需要这一步（用户的原话：「没有上线 docker 吧，我看不到」）：
    docker compose cp 是把文件拷进**正在运行的那个容器**，它活在容器的可写层里。
    容器一旦被**重建**（docker compose up -d / --force-recreate / 换配置），
    它会从**镜像**重新起来 —— 而镜像还是几天前构建的，于是页面"退回旧版"。
    实测：改这一步之前，镜像 niumadate:latest 是 5 天前的，
    而容器里是我刚拷进去的新产物；一重建就全没了。

  最干净的做法当然是 docker compose build（在镜像里重新构建前端），
  但那需要联网装依赖（关了 VPN 就会失败）。所以给一个离线也行的兜底：
  把当前容器的状态 commit 成同一个 tag，重建时就从这份新镜像起来。
  ---- */
if (IMAGE) {
  run('docker', ['commit', CONTAINER, 'niumadate:latest']);
  console.log('✓ 已把当前产物烘进 niumadate:latest（重建容器不会退回旧版）。');
}

// ---- 5. 公网（可选） ----
if (PUBLIC) {
  const url = 'https://niumadate.xyz/';
  const html = execFileSync(
    'curl.exe',
    ['-s', '--resolve', 'niumadate.xyz:443:104.21.45.42', url],
    { encoding: 'utf8' },
  );
  const publicAssets = assetsOf(html);
  console.log('\n公网产物：' + publicAssets.join('  '));
  const miss = localAssets.filter((a) => !publicAssets.includes(a));
  if (miss.length > 0) {
    console.error('\n⚠ 公网还没换过来（CDN 缓存？）：' + miss.join('  '));
    process.exit(1);
  }
  console.log('\n✓ 公网也是新的。');
}
