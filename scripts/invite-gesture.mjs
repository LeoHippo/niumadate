#!/usr/bin/env node
/**
 * 拆信手势的真机验收：**用真实的鼠标输入**去拆那封信，然后看结果。
 *
 * 为什么非要单独写这一个脚本：
 *   之前那套截图工具是"暂停动画 + 手动设 currentTime"——
 *   它能验证"某一帧长什么样"，但**验证不了"手指能不能拆开"**：
 *   暂停的动画永远在那里，拉不拉得动它一个字都不说。
 *   而这一版的核心就是"进度由手指决定"，唯一的验法就是真的按下去、真的往下拖。
 *
 * 它走的是 CDP 的 Input.dispatchMouseEvent —— 浏览器合成的**可信事件**，
 * 会真的走一遍 pointerdown / pointermove / pointerup 和 setPointerCapture，
 * 跟人用手指按是一回事（不是 dispatchEvent 那种假事件）。
 *
 * 用法：node scripts/invite-gesture.mjs
 *   BASE=...（默认 http://127.0.0.1:8787）
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveAdminPassword } from './admin-password.mjs';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const API = BASE + '/api';
const OUT = '.shots';
mkdirSync(OUT, { recursive: true });

/*
  ROLE：四套身份各跑一遍时要能选人（brother / sister / baby / dadmam）。
  SHOT_PREFIX：四遍都落同一批文件名会互相覆盖，所以前缀也跟着身份走。
  两者都只在跑验收时用，**断言一条都没动** —— 手势该验的还是那 13 条。
*/
const ROLE = process.env.ROLE ?? 'sister';
const PREFIX = process.env.SHOT_PREFIX ?? 'gesture-';

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

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('  \u2713 ' + label);
  } else {
    failures.push(label);
    console.log('  \u2717 ' + label + (detail === undefined ? '' : ' — ' + detail));
  }
}

async function createInvite() {
  const login = await (
    await fetch(API + '/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: resolveAdminPassword() }),
    })
  ).json();
  if (login.token === undefined) {
    throw new Error('后台登录失败：口令不对（用 ADMIN_PASSWORD 环境变量，或 apps/server/data/admin-password）');
  }
  const date = new Date().toISOString().slice(0, 10);
  const res = await fetch(API + '/admin/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
    body: JSON.stringify({
      role: ROLE,
      date,
      inviteeName: '手势验收',
      timeText: '周六下午三点',
      place: '楼下那家咖啡',
      activity: '坐着聊聊',
    }),
  });
  const payload = await res.json();
  if (payload.invite === undefined) throw new Error('建邀请失败：' + JSON.stringify(payload));
  return { code: payload.invite.code, token: login.token };
}

/**
 * 每一屏都读同一份数：拆信层里所有动画都被按在同一个 currentTime 上
 * （= 手指进度 × 总时长），所以 max 就是"现在拆到哪儿了"。
 * 用数组拼字符串而不是模板串，是为了这个文件本身好写进别的脚本里。
 */
const READ = [
  '(() => {',
  '  const root = document.querySelector(".opening");',
  '  if (root === null) return { gone: true };',
  '  const anims = root.getAnimations({ subtree: true });',
  '  const times = anims.map((a) => Math.round(Number(a.currentTime) || 0));',
  '  const paper = root.querySelector(".op-env-paper");',
  '  const pr = paper === null ? null : paper.getBoundingClientRect();',
  '  const env = root.querySelector(".op-env");',
  '  const seal = root.querySelector(".op-env-seal");',
  '  const sr = seal === null ? null : seal.getBoundingClientRect();',
  '  const hint = document.querySelector(".opening-hint");',
  '  return {',
  '    gone: false,',
  '    paused: anims.every((a) => a.playState === "paused"),',
  '    count: anims.length,',
  '    min: times.length === 0 ? null : Math.min.apply(null, times),',
  '    max: times.length === 0 ? null : Math.max.apply(null, times),',
  '    hint: hint === null ? null : hint.dataset.gone,',
  '    paper: pr === null ? null : { top: Math.round(pr.top), h: Math.round(pr.height), w: Math.round(pr.width) },',
  '    paperOp: paper === null ? null : Number(getComputedStyle(paper).opacity),',
  '    envOp: env === null ? null : Number(getComputedStyle(env).opacity),',
  '    seal: sr === null ? null : { w: Math.round(sr.width), h: Math.round(sr.height), top: Math.round(sr.top) },',
  '  };',
  '})()',
].join('\n');

const SEAL_CENTER = [
  '(() => {',
  '  const el = document.querySelector(".op-env-seal");',
  '  if (el === null) return null;',
  '  const r = el.getBoundingClientRect();',
  '  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };',
  '})()',
].join('\n');

async function main() {
  console.log('\n=== 拆信手势验收 ' + BASE + ' ===\n');
  const invite = await createInvite();
  const url = BASE + '/i/' + invite.code + '?v=' + Date.now();
  console.log('  邀请：' + url + '（身份 ' + ROLE + '）\n');

  const port = 9400 + (process.pid % 300);
  const profile = mkdtempSync(path.join(tmpdir(), 'niumadate-gesture-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profile,
      '--window-size=430,932',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  try {
    let target = null;
    for (let i = 0; i < 80 && target === null; i += 1) {
      await sleep(250);
      try {
        const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        target = list.find((t) => t.type === 'page') ?? null;
      } catch {
        /* 还没起来，接着等 */
      }
    }
    if (target === null) throw new Error('Chrome 没起来（调试端口连不上）');
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
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面里报错：' + JSON.stringify(r.exceptionDetails.exception));
      return r.result.value;
    };
    const shot = async (name) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    };
    const waitFor = async (expr, label, tries = 80) => {
      for (let i = 0; i < tries; i += 1) {
        if (await evaluate('!!(' + expr + ')')) return true;
        await sleep(120);
      }
      throw new Error('等不到：' + label);
    };
    const mouse = (type, x, y, extra = {}) =>
      cdp.send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', clickCount: 1 }, extra));

    /* ── 第一场：按住火漆，往下拉 ────────────────────────────── */
    console.log('[1] 按住火漆，往下拉 240 像素');
    await cdp.send('Page.navigate', { url });
    await waitFor("document.querySelector('.op-env-seal')", '火漆出现');
    await sleep(1500);

    const start = await evaluate(READ);
    check(
      '信一开始是**闭着**的（动画全 paused，currentTime 全 0 —— 不再自动演）',
      start.paused === true && start.max === 0 && start.count > 0,
      JSON.stringify(start),
    );
    check('屏幕上有火漆', start.seal !== null && start.seal.w > 20, JSON.stringify(start.seal));
    check('一上来就摆着「按住火漆，往下拉」的提示', start.hint === 'false', String(start.hint));
    await shot(PREFIX + '00-closed');

    const rect = await evaluate(SEAL_CENTER);
    if (rect === null) throw new Error('拿不到火漆的位置');
    await mouse('mousePressed', rect.x, rect.y);

    const frames = [];
    const STEPS = 12;
    const PX = 240 / STEPS;
    for (let i = 1; i <= STEPS; i += 1) {
      await mouse('mouseMoved', Math.round(rect.x), Math.round(rect.y + PX * i), { buttons: 1 });
      await sleep(90);
      const now = await evaluate(READ);
      frames.push(Object.assign({ i, p: i / STEPS }, now));
      if (i % 2 === 0) await shot(PREFIX + String(i).padStart(2, '0') + '-drag');
    }

    const mid = frames.find((f) => f.i === 6);
    const grown = frames.find((f) => f.i === 8);
    const late = frames.find((f) => f.i === 12);
    check(
      '拉到一半 → 动画进度跟着走到 50%（2150ms 左右）',
      mid !== undefined && Math.abs(mid.max - 2150) <= 150,
      mid === undefined ? '没有中间帧' : 'currentTime=' + mid.max + '（期望约 2150）',
    );
    check(
      '拉到一半 → 动画仍然是「暂停」的（是手指在驱动，不是它自己在跑）',
      mid !== undefined && mid.paused === true,
      mid === undefined ? '' : String(mid.paused),
    );
    /*
      "纸被抽出来"这一条要分两个数看：
       ① 纸自己得长大（真的在被抽出来）；
       ② 更关键 —— **包着它的 .op-env 不能淡掉**。
       ②是这一轮抓到的大 bug：拉到 100% 时屏幕是空的，
       因为 .op-env 整层 opacity=0，把里面的纸一起抹掉了
       （纸自己 opacity=1、scale=1.35，光看纸的计算值一切正常）。
       所以这里两条都锁住，以后谁再改信封的退场都能立刻发现。
    */
    check(
      '拉到 2/3 时纸已经露头、看得见',
      grown !== undefined && grown.paperOp !== null && grown.paperOp > 0.8,
      grown === undefined ? '没有这一帧' : '纸自己的 opacity=' + String(grown.paperOp),
    );
    check(
      '拉到 100% 时纸长大了（223 -> 290 上下，正好接上第二屏的宽度）',
      grown !== undefined && late !== undefined && late.paper !== null && grown.paper !== null && late.paper.h > grown.paper.h * 1.15,
      grown !== undefined && late !== undefined ? JSON.stringify({ p67: grown.paper, p100: late.paper }) : '',
    );
    check(
      '拉到 100% 时纸还在屏幕上 —— 信封那层没有把纸一起带走',
      late !== undefined && late.paperOp !== null && late.paperOp > 0.9 && late.envOp !== null && late.envOp > 0.9,
      late === undefined ? '' : '纸 opacity=' + String(late.paperOp) + ' 信封层 opacity=' + String(late.envOp),
    );
    check('开始拆之后提示文字就不挡戏了', late !== undefined && late.hint === 'true', late === undefined ? '' : String(late.hint));
    check('拉到 100% 时动画也走满了', late !== undefined && late.max >= 4200, late === undefined ? '' : String(late.max));

    await mouse('mouseReleased', Math.round(rect.x), Math.round(rect.y + 240));
    let gone = false;
    for (let i = 0; i < 30 && !gone; i += 1) {
      await sleep(100);
      gone = await evaluate("document.querySelector('.opening') === null");
    }
    check('松手后拆信层自己退场，邀请函接管屏幕', gone === true, 'opening 还在');
    await sleep(500);
    await shot(PREFIX + '13-after');

    /* ── 第二场：不拖，只点一下（给不会拖的人兜底） ──────────── */
    console.log('');
    console.log('[2] 只点一下（不拖）也要能看完');
    await cdp.send('Page.navigate', { url: url + '&tap=1' });
    await waitFor("document.querySelector('.op-env-seal')", '火漆出现（第二次）');
    await sleep(500);
    const box = await evaluate(SEAL_CENTER);
    if (box === null) throw new Error('拿不到火漆的位置（第二次）');
    // 特意点在一个**不是火漆**的地方：兜底路径必须也管用
    await mouse('mousePressed', box.x, Math.round(box.y - 220));
    await mouse('mouseReleased', box.x, Math.round(box.y - 220));
    await sleep(900);
    const during = await evaluate(READ);
    /*
      注意：这里 paused 应该是 **true**。
      进度是 JS 在推（tween 改 p，每帧把动画 seek 过去），
      所以"看着像在播"的动画其实一直是暂停的 —— 这正是手动挡的样子。
      只要 max 在往前走，就说明它在自己拆。
    */
    check(
      '点一下之后进度自己往前走（不用手指也能看完）',
      during !== undefined && during.gone !== true && during.max > 300,
      JSON.stringify({ max: during === undefined ? null : during.max, paused: during === undefined ? null : during.paused }),
    );
    let gone2 = false;
    for (let i = 0; i < 40 && !gone2; i += 1) {
      await sleep(100);
      gone2 = await evaluate("document.querySelector('.opening') === null");
    }
    check('点一下这条路子也能走到拆完', gone2 === true);
    await sleep(400);
    await shot(PREFIX + '14-tap-after');

    console.log('');
    console.log('=== 通过 ' + passed + ' 项，失败 ' + failures.length + ' 项 ===');
    if (failures.length > 0) {
      for (const f of failures) console.log('  x ' + f);
      process.exitCode = 1;
    } else {
      console.log('拆信手势全部走通（帧在 ' + OUT + '/gesture-*.png）');
      console.log('');
    }
  } finally {
    try {
      if (cdp !== null) cdp.ws.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

await main().catch((error) => {
  console.error('手势验收跑挂了：', error);
  process.exitCode = 1;
});