#!/usr/bin/env node
/**
 * 后台截图检查：不需要人登录，脚本自己拿 token 灌进 localStorage 再拍。
 *
 * 为什么要有它：这几轮我改后台一直只做 typecheck + 产物字符串确认，
 * 从没在浏览器里看过一眼 —— 用户报「点编辑没反应」时我完全无从下手。
 * 用法：node scripts/admin-shot.mjs [--click 编辑]
 * 产出：.shots/admin-*.png + 一行 PROBE（关键元素在不在）
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ZJJR-3SUW-WEHQ';
const OUT = '.shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const e = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) e.reject(new Error(JSON.stringify(m.error))); else e.resolve(m.result); } }); }
  send(method, params = {}) { const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params })); }); }
}

const login = await (await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) })).json();
if (login.token === undefined) { console.error('登录失败：口令不对'); process.exit(1); }

const port = 9600 + (process.pid % 200);
const profile = mkdtempSync(path.join(tmpdir(), 'niumadate-admin-'));
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','--remote-debugging-port=' + port,'--user-data-dir=' + profile,'--window-size=430,932','about:blank'], { stdio: 'ignore' });
let cdp = null;
try {
  let target = null;
  for (let i = 0; i < 80 && target === null; i += 1) {
    await sleep(250);
    try { const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = list.find((t) => t.type === 'page') || null; } catch { /* 等 */ }
  }
  if (target === null) throw new Error('Chrome 没起来');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', () => reject(new Error('ws 连不上'))); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.bringToFront');
  const evaluate = async (expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result.value; };
  const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };

  await cdp.send('Page.navigate', { url: BASE + '/admin' });
  await sleep(1200);
  await evaluate('window.localStorage.setItem(' + JSON.stringify('niumadate.admin.token') + ', ' + JSON.stringify(login.token) + ')');
  await cdp.send('Page.navigate', { url: BASE + '/admin' });
  await sleep(2500);
  /* 后台默认落在「申请」那一页，邀请列表在旁边那个 tab 里 —— 先切过去再检查。 */
  await evaluate('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "邀请"); if (b) b.click(); })()');
  await sleep(900);
  const before = await evaluate('JSON.stringify({ rows: document.querySelectorAll(".invite-row").length, editBtns: [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "编辑").length, editor: document.querySelector(".invite-editor") !== null })');
  console.log('PROBE 截图前 ' + before);
  await shot('admin-01-list');

  const clicked = await evaluate('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "编辑"); if (!b) return false; b.click(); return true; })()');
  await sleep(900);
  const after = await evaluate('JSON.stringify({ editor: document.querySelector(".invite-editor") !== null, saveBtn: [...document.querySelectorAll("button")].some((b) => b.textContent.includes("保存")), body: document.body.innerText.slice(0, 80) })');
  console.log('PROBE 点了编辑(' + String(clicked) + ') ' + after);
  await shot('admin-02-after-edit');
  console.log('落图：' + OUT + '/admin-01-list.png, admin-02-after-edit.png');
} finally {
  try { if (cdp !== null) cdp.ws.close(); } catch { /* ignore */ }
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}