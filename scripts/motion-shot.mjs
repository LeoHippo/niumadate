#!/usr/bin/env node
/**
 * 纯 Node 的 CDP 截图工具（不装任何第三方包 —— 用 Node 内置的 WebSocket）。
 *
 * 为什么要单独写这么个东西：
 *   动画截图以前总是拍到"静止的第一帧"，因为后台标签页的渲染会被节流。
 *   这里的做法是：先把页面 bringToFront，等 React 渲染稳定（默认 700ms），
 *   再把 document.getAnimations() 全部 pause() 并 currentTime 设为指定毫秒，
 *   此时画面是冻结的，截图才可信。
 *
 * 用法： node scripts/motion-shot.mjs spec.json
 * spec.json:
 * {
 *   "url": "http://127.0.0.1:8787/dev/motion?motion=on",
 *   "width": 1240, "height": 920,
 *   "settle": 900,          // 导航后等待 React 首屏的毫秒数
 *   "prepare": "js 字符串", // 可选：隐藏其它卡片 / 设置速度
 *   "probe": "js 字符串",   // 可选：打印诊断信息（返回 JSON 可序列化的值）
 *   "shots": [{ "name": "A-500", "ms": 500, "js": "可选：本张专属的预处理" }]
 * }
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const outDir = spec.outDir || '.shots';
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('CDP 超时: ' + method));
      }, 30000);
    });
  }
  async eval(expression, sessionId) {
    const r = await this.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (r.exceptionDetails) throw new Error('页面脚本报错: ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  }
}

const port = 9300 + Math.floor(Math.random() * 400);
const userDataDir = mkdtempSync(path.join(tmpdir(), 'dsh-chrome-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + userDataDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=' + spec.width + ',' + spec.height,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let cdp;
try {
  let version = null;
  for (let i = 0; i < 120 && !version; i++) {
    await sleep(150);
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version');
      version = await res.json();
    } catch { /* 还没起来 */ }
  }
  if (!version) throw new Error('Chrome 调试端口没起来');

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true });
  });
  cdp = new CDP(ws);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: spec.width, height: spec.height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  // 关键：不 bringToFront 的话，标签页被当成后台页，渲染被节流，动画永远不前进。
  await cdp.send('Page.bringToFront', {}, sessionId);

  await cdp.send('Page.navigate', { url: spec.url }, sessionId);
  await sleep(spec.settle ?? 1200);

  if (spec.prepare) {
    await cdp.eval(spec.prepare, sessionId);
    await sleep(300);
  }

  if (spec.probe) {
    const v = await cdp.eval(spec.probe, sessionId);
    console.log('PROBE ' + JSON.stringify(v, null, 1));
  }

  const pauseJs = (ms) =>
    'document.getAnimations().forEach(function(a){ try { a.pause(); a.currentTime = ' + ms + '; } catch (e) {} });' +
    '"paused:" + document.getAnimations().length';

  for (const shot of spec.shots) {
    if (shot.js) {
      await cdp.eval(shot.js, sessionId);
      await sleep(shot.settle ?? 700);
    }
    // 第一遍 pause 后 React 可能又渲染出新动画，所以隔一拍再 pause 一遍。
    await cdp.eval(pauseJs(shot.ms), sessionId);
    await sleep(120);
    const n = await cdp.eval(pauseJs(shot.ms), sessionId);
    await sleep(60);
    // shot.clip 传选择器时，只截那个元素，并按 shot.scale 放大 —— 想看清 76px 的章就用它
    let params = { format: 'png' };
    if (shot.clip) {
      const rect = await cdp.eval(
        '(function(){var e=document.querySelector(' + JSON.stringify(shot.clip) + ');if(!e)return null;' +
          'var r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()',
        sessionId,
      );
      if (rect && rect.width > 0) {
        const pad = shot.pad ?? 0;
        params.clip = {
          x: Math.max(0, rect.x - pad),
          y: Math.max(0, rect.y - pad),
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          scale: shot.scale ?? 3,
        };
        params.captureBeyondViewport = true;
      }
    }
    // shot.after：在"已经定格到 shot.ms"之后取一次诊断值并打印出来。
    // 想做"某一毫秒时的计算样式"，必须先定格再量，否则量到的永远是第 0 帧。
    if (shot.after) {
      const v = await cdp.eval(shot.after, sessionId);
      console.log('AFTER ' + shot.name + ' ' + JSON.stringify(v));
    }
    const { data } = await cdp.send('Page.captureScreenshot', params, sessionId);
    const file = path.join(outDir, shot.name + '.png');
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('SHOT ' + file + ' @' + shot.ms + 'ms ' + n);
  }
} finally {
  try { if (cdp) await cdp.send('Browser.close'); } catch { /* ignore */ }
  await sleep(200);
  try { chrome.kill(); } catch { /* ignore */ }
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}