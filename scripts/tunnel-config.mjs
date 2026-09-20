#!/usr/bin/env node
/**
 * 帮你写出 Cloudflare 固定隧道的配置文件。
 *
 * 手写那份 config.yml 是最容易翻车的一步：里面要塞隧道 UUID，
 * 而 UUID 只出现在 `cloudflared tunnel create` 的输出里（刷过去就找不到了）。
 * 其实它就在 ~/.cloudflared/<UUID>.json 里 —— 这个脚本替你翻出来。
 *
 * 用法：
 *   node scripts/tunnel-config.mjs niuma.你的域名.com
 *
 * 前提：已经跑过 `cloudflared tunnel login` 和 `cloudflared tunnel create <名字>`
 *
 * 生成的配置默认**把后台挡在公网之外**（公网访问 /admin 直接 404），
 * 后台只在自己电脑上开 http://127.0.0.1:8787/admin 用。
 * 想让后台也能从手机公网访问，就把配置里那两条 http_status:404 删掉。
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const hostname = process.argv[2];
if (hostname === undefined || !hostname.includes('.')) {
  console.error('用法：node scripts/tunnel-config.mjs niuma.你的域名.com');
  process.exit(1);
}

const cf = join(homedir(), '.cloudflared');
if (!existsSync(cf)) {
  console.error('找不到 ' + cf);
  console.error('先跑：cloudflared tunnel login');
  process.exit(1);
}

// 凭据文件就叫 <UUID>.json，里面 TunnelID 就是要的那个
const creds = readdirSync(cf).filter((f) => /^[0-9a-f-]{36}\.json$/i.test(f));
if (creds.length === 0) {
  console.error('在 ' + cf + ' 里没找到隧道凭据（形如 <UUID>.json）');
  console.error('先跑：cloudflared tunnel create niumadate');
  process.exit(1);
}
if (creds.length > 1) {
  console.log('发现多条隧道，用最后创建的那条：');
  for (const c of creds) console.log('  ' + c);
}
const credFile = creds[creds.length - 1];
const tunnelId = credFile.replace(/\.json$/i, '');
const parsed = JSON.parse(readFileSync(join(cf, credFile), 'utf8'));
if (parsed.TunnelID !== undefined && parsed.TunnelID !== tunnelId) {
  console.log('  注意：文件名和里面的 TunnelID 不一致，以里面的为准');
}

const id = parsed.TunnelID ?? tunnelId;
const outPath = join(cf, 'config.yml');
/*
  生成的配置里有三个地方是**踩过坑才这么写的**，别随手改回去：

  1. service 写 127.0.0.1 而不是 localhost
     Windows 上 localhost 常先解析到 IPv6 ::1，而 compose 的
     "127.0.0.1:8787:8787" 只绑了 IPv4 —— 隧道连不上源，公网全线 502。

  2. 两条 http_status:404 把 /admin 和 /api/admin 挡在公网之外
     隧道是把**整个站点**原样搬出去的，不区分「好友页面」和「后台」。
     不挡的话，任何人打开 https://域名/admin 都能看到后台登录页，
     只剩口令一道防线。挡掉之后公网连登录页都看不到，
     自己开 http://127.0.0.1:8787/admin 照常用。

  3. 兜底规则必须最后、且不带任何过滤条件
     少了它，cloudflared 会报 "The last ingress rule must match all URLs" 起不来。
*/
const yaml = `# 由 scripts/tunnel-config.mjs 生成
#
# protocol: http2 —— QUIC 在国内常被劣化（日志里出现过 "failed to dial to edge
# with quic"），换成 http2 通常更稳。想用默认的 QUIC 就删掉这一行。
protocol: http2

tunnel: ${id}
credentials-file: ${join(cf, id + '.json')}

# 规则从上往下匹配，第一条命中就结束 —— 所以屏蔽必须写在放行前面
ingress:
  - hostname: ${hostname}
    path: ^/admin
    service: http_status:404
  - hostname: ${hostname}
    path: ^/api/admin
    service: http_status:404
  - hostname: ${hostname}
    service: http://127.0.0.1:8787
  - service: http_status:404
`;

if (existsSync(outPath)) {
  console.log('⚠ ' + outPath + ' 已存在，内容如下（会被覆盖）：');
  console.log(readFileSync(outPath, 'utf8'));
  console.log('按 Ctrl+C 可以取消……（3 秒后覆盖）');
  await new Promise((r) => setTimeout(r, 3000));
}

writeFileSync(outPath, yaml, 'utf8');
console.log('✓ 已写入 ' + outPath);
console.log('');
console.log(yaml);
console.log('接下来：');
console.log('  1. docker compose up -d                     # 确保应用在跑');
console.log('  2. cloudflared tunnel run niumadate          # 起隧道');
console.log('  3. 手机 4G 打开 https://' + hostname);
