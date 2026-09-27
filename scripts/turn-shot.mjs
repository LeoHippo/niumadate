#!/usr/bin/env node
/**
 * 翻页演出的密集截帧工具（每 250ms 一帧，**实拍**：不暂停、不 seek）。
 *
 * 为什么要单独写：
 *   · scripts/invite-gesture.mjs 只驱动"拆信"那一拍；
 *   · motion-shot.mjs 的暂停+seek 对翻页其实有效（常驻 rAF 只作用在 .opening 子树，
 *     展开层退场后就停了），但它没法把页面**驱动到翻页那一步**。
 * 所以这个脚本负责那一段：造邀请 → 等拆信自动演完交接给第二屏 → 用**可信鼠标事件**
 * 点「轻点继续」→ 每 250ms 落一帧。
 *
 * 用法：ROLE=sister node scripts/turn-shot.mjs
 * 产出：.shots/turn-0000.png ... 以及开头一行 PROBE（动画名 / 有没有进入 leaving）
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const API = BASE + '/api';
const ROLE = process.env.ROLE || 'sister';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ZJJR-3SUW-WEHQ';
const OUT = '.shots';
const STEP = 250;
const FRAMES = 28;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
        else entry.resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function createInvite() {
  const login = await (await fetch(API + '/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })).json();
  if (login.token === undefined) throw new Error('后台登录失败：口令不对');
  const date = new Date().toISOString().slice(0, 10);
  const res = await fetch(API + '/admin/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
    body: JSON.stringify({ role: ROLE, date, inviteeName: '翻页验收', timeText: '周六下午三点', place: '楼下那家咖啡', activity: '坐着聊聊' }),
  });
  const payload = await res.json();
  if (payload.invite === undefined) throw new Error('建邀请失败：' + JSON.stringify(payload));
  return payload.invite.code;
}

async function main() {
  const code = await createInvite();
  const url = BASE + '/i/' + code + '?v=' + Date.now();
  console.log('邀请：' + url);
  const port = 9700 + (process.pid % 200);
  const profile = mkdtempSync(path.join(tmpdir(), 'niumadate-turn-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    '--window-size=430,932', 'about:blank',
  ], { stdio: 'ignore' });
  let cdp = null;
  try {
    let target = null;
    for (let i = 0; i < 80 && target === null; i += 1) {
      await sleep(250);
      try {
        const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        target = list.find((t) => t.type === 'page') || null;
      } catch { /* 还没起来 */ }
    }
    if (target === null) throw new Error('Chrome 没起来');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('调试 WebSocket 连不上')));
    });
    cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.bringToFront');
    const evaluate = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result.value;
    };
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    };
    await cdp.send('Page.navigate', { url });
    // 等拆信自己演完并把屏幕交给第二屏（展开层从 DOM 里消失就是交接完成的标志）
    for (let i = 0; i < 120; i += 1) {
      await sleep(250);
      const gone = await evaluate("document.querySelector('.opening') === null");
      if (gone === true) break;
    }
    await sleep(700);
    const probe = await evaluate("JSON.stringify({ hasNext: document.querySelector('.screen-next') !== null, step: (document.querySelector('.screen-step') || {}).textContent || '', names: [...new Set(document.getAnimations().map((a) => a.animationName))].slice(0, 8) })");
    console.log('PROBE ' + probe);
    const rect = await evaluate("(() => { const b = document.querySelector('.screen-next'); if (b === null) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()");
    if (rect === null) console.log('提示：这一屏没有「轻点继续」，直接点 TARGET');
    /*
      MOVES 是按屏号轮换的（pull / fly / push），所以"点几次"决定拍到哪一支：
      第 2 屏点一次 = push，点两次 = pull。CLICKS 环境变量控制。
    */
    const clicks = Number(process.env.CLICKS || '1');
    const clickOnce = async (sel = '.screen-next') => {
      const spot = await evaluate("(() => { const b = document.querySelector('" + sel + "'); if (b === null) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()");
      if (spot === null) { console.log('点不到: ' + sel); return false; }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', clickCount: 1 });
      return true;
    };
    for (let c = 1; c < clicks; c += 1) {
      if ((await clickOnce()) === false) break;
      await sleep(6800);
    }
    // 最后这一下才是被拍的那次换屏（上面那些只是"把页面推进到想拍的那一支"）
    await clickOnce(process.env.TARGET || '.screen-next');
    for (let i = 0; i < FRAMES; i += 1) {
      await sleep(STEP);
      await shot('turn-' + String(i * STEP).padStart(4, '0'));
      if (i % 6 === 0) {
        const info = await evaluate("JSON.stringify({ leaving: document.querySelector('.card-leaving') !== null, entering: document.querySelector('.card-entering') !== null, puller: (document.querySelector('.puller') || {}).className || '' })");
        console.log('  ' + (i * STEP) + 'ms ' + info);
      }
    }
    console.log('落帧完成：' + OUT + '/turn-*.png');
  } finally {
    try { if (cdp !== null) cdp.ws.close(); } catch { /* ignore */ }
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

await main().catch((error) => {
  console.error('翻页取证跑挂了：', error);
  process.exitCode = 1;
});