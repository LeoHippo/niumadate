import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const sh = (cmd) => execSync(cmd, { cwd: 'E:/niumadate', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const trysh = (cmd) => { try { return { ok: true, out: String(sh(cmd)) }; } catch (e) { return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') + String(e.message ?? '') }; } };

// 0. 代理通不通（Docker 拉镜像要走它）
console.log('=== ① 代理 127.0.0.1:7897 通不通 ===');
const probe = trysh('powershell -NoProfile -Command "(Test-NetConnection 127.0.0.1 -Port 7897 -InformationLevel Quiet) 2>$null"');
console.log('  ' + (String(probe.out).trim() === 'True' ? '✓ 通着，VPN 开着' : '✗ 不通 —— VPN 还是关的'));

// 1. 本地产物
const local = readdirSync('E:/niumadate/apps/web/dist/assets').filter((f) => f.endsWith('.js'));
console.log('');
console.log('=== ② 本地构建产物 ===');
for (const f of local) console.log('  ' + f);

// 2. 容器里的
console.log('');
console.log('=== ③ 容器里的（重建前）===');
console.log('  ' + String(trysh('docker compose exec -T app sh -c "ls /app/apps/web/dist/assets/*.js"').out).trim().split('\n').map((l) => l.replace(/.*\//, '')).join('\n  '));

// 3. 重建
console.log('');
console.log('=== ④ docker compose up -d --build（这次不吞输出）===');
const build = trysh('docker compose up -d --build 2>&1');
const lines = String(build.out).split('\n').filter((l) => /Built|Started|Recreate|ERROR|error|failed|denied|resolve source/i.test(l));
for (const l of lines.slice(-14)) console.log('  ' + l.trim().slice(0, 150));
if (lines.length === 0) console.log('  (没有匹配到关键行，原始尾部：)\n  ' + String(build.out).split('\n').slice(-8).join('\n  ').slice(0, 600));

// 4. 等应用起来
for (let i = 0; i < 40; i += 1) { try { await (await fetch('http://127.0.0.1:8787/api/health')).json(); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

console.log('');
console.log('=== ⑤ 容器里的（重建后）===');
const after = String(trysh('docker compose exec -T app sh -c "ls /app/apps/web/dist/assets/*.js"').out).trim().split('\n').map((l) => l.replace(/.*\//, '')).filter(Boolean);
for (const f of after) console.log('  ' + f);
const updated = local.some((f) => after.includes(f));
console.log('');
console.log(updated ? '  ✓✓✓ 容器里已经是本地构建的那份，重建成功' : '  ✗ 容器里还是旧的（重建没生效）');

console.log('');
console.log('=== ⑥ 后端有没有进去（找邀请接口）===');
const hasInvite = String(trysh('docker compose exec -T app sh -c "grep -c invite_messages /app/apps/server/dist/index.js"').out).trim();
console.log('  含 invite_messages: ' + (hasInvite.split('\n').pop() ?? '?'));
