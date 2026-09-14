#!/usr/bin/env node
/**
 * 一次性的本地演练环境。
 *
 * 想试「第一次部署时会发生什么」（尤其是自动生成后台口令那一步），
 * 又不想动本机那份真实数据时用它。
 *
 * 它只做三件事：**换一个端口、换一个数据目录、把服务起起来**。
 * 代码还是仓库里的那一份，没有任何复制；所有新增的东西都在 `.sandbox/` 里。
 * 所以 `nuke` 一跑就**彻底没了** —— 数据库、配置、生成的口令全没，
 * 主环境（8787 那份）连一根汗毛都没动。
 *
 * 用法：
 *   node scripts/sandbox.mjs start     起一个（默认 8788）
 *   node scripts/sandbox.mjs status    看它活着没、口令是什么
 *   node scripts/sandbox.mjs stop      停掉（数据留着）
 *   node scripts/sandbox.mjs nuke      停掉并删干净
 *
 * 环境变量：
 *   SANDBOX_PORT   换端口，默认 8788
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const boxDir = resolve(root, '.sandbox');
const dataDir = join(boxDir, 'data');
const pidPath = join(boxDir, 'pid');
const logPath = join(boxDir, 'server.log');
const entry = resolve(root, 'apps/server/dist/index.js');

const port = process.env.SANDBOX_PORT ?? '8788';
const base = `http://127.0.0.1:${port}`;

function readPid() {
  if (!existsSync(pidPath)) return null;
  const pid = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
  return Number.isInteger(pid) ? pid : null;
}

function alive(pid) {
  if (pid === null) return false;
  try {
    // 信号 0 不真的发信号，只探活。
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reachable() {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function showPassword() {
  const file = join(dataDir, 'admin-password');
  if (!existsSync(file)) return '(还没生成)';
  return readFileSync(file, 'utf8').trim();
}

async function start() {
  if (!existsSync(entry)) {
    console.error('❌ 还没构建。先跑：pnpm -r run build');
    process.exit(1);
  }

  const old = readPid();
  if (alive(old)) {
    console.log(`已经在跑了（PID ${old}）：${base}`);
    console.log(`后台口令：${showPassword()}`);
    return;
  }

  if (await reachable()) {
    console.error(`❌ ${port} 端口上有别的东西在应答，换一个：SANDBOX_PORT=8888 ...`);
    process.exit(1);
  }

  mkdirSync(dataDir, { recursive: true });

  /*
    stdio 用**文件描述符**而不是管道。
    管道在这里没用（我们不等它说话），而且受限环境里开管道会直接 EPERM。
    日志落到 .sandbox/server.log，nuke 时一起删掉。
  */
  const log = openSync(logPath, 'a');
  const child = spawn(process.execPath, [entry], {
    cwd: resolve(root, 'apps/server'),
    detached: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      PORT: port,
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      NODE_ENV: 'production',
      // 故意**不设** ADMIN_PASSWORD 和 SESSION_SECRET：
      // 这正是要演的那一段 —— 第一次启动自己生成口令并打印。
      ADMIN_PASSWORD: '',
      SESSION_SECRET: '',
    },
  });
  child.unref();
  writeFileSync(pidPath, String(child.pid), 'utf8');

  // 等它起来
  for (let i = 0; i < 40; i += 1) {
    if (await reachable()) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!(await reachable())) {
    console.error('❌ 起不来。看一眼日志：');
    console.error(`   ${logPath}`);
    process.exit(1);
  }

  console.log('');
  console.log('  ✓ 演练环境已启动（和主环境完全隔离）');
  console.log('');
  console.log(`    好友端   ${base}/`);
  console.log(`    后台     ${base}/admin`);
  console.log(`    后台口令 ${showPassword()}`);
  console.log('');
  console.log(`    数据在   .sandbox/data/   （独立的一份数据库和配置）`);
  console.log(`    日志在   .sandbox/server.log`);
  console.log('');
  console.log('    停掉： node scripts/sandbox.mjs stop');
  console.log('    删干净：node scripts/sandbox.mjs nuke');
  console.log('');
}

async function status() {
  const pid = readPid();
  const up = await reachable();
  console.log(`进程：${alive(pid) ? `活着（PID ${pid}）` : '没在跑'}`);
  console.log(`接口：${up ? `${base} 应答正常` : '连不上'}`);
  console.log(`口令：${showPassword()}`);
  console.log(`目录：${existsSync(boxDir) ? boxDir : '（还没建，是干净的）'}`);
}

function stop() {
  const pid = readPid();
  if (!alive(pid)) {
    console.log('本来就没在跑。');
    return;
  }
  process.kill(pid);
  rmSync(pidPath, { force: true });
  console.log(`已停掉 PID ${pid}。（数据还留着，下次 start 能接着用）`);
}

async function nuke() {
  stop();
  // 给它一点时间退出，再删目录 —— Windows 上文件还被占着会删不掉。
  for (let i = 0; i < 20; i += 1) {
    if (!existsSync(boxDir)) break;
    try {
      rmSync(boxDir, { recursive: true, force: true });
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  console.log(existsSync(boxDir) ? '⚠ 没删干净，手动删掉 .sandbox/ 即可。' : '✓ .sandbox/ 已删除，环境彻底没了。');
}

const action = process.argv[2] ?? 'start';
const actions = { start, status, stop, nuke };
const fn = actions[action];
if (fn === undefined) {
  console.error(`不认识的命令：${action}。可用：${Object.keys(actions).join(' / ')}`);
  process.exit(1);
}
await fn();
