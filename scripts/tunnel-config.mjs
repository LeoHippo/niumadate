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
const yaml = `# 由 scripts/tunnel-config.mjs 生成
tunnel: ${id}
credentials-file: ${join(cf, id + '.json')}

ingress:
  - hostname: ${hostname}
    service: http://localhost:8787
  # 兜底：必须有，否则 cloudflared 启动会报错
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
