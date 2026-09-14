/**
 * UI 冒烟测试：用无头 Chrome 真的走一遍用户端向导，每一步截一张图。
 *
 * 用法：
 *   1. pnpm build && pnpm --filter @niumadate/server run start
 *   2. node scripts/ui-smoke.mjs
 *
 * 环境变量：
 *   SMOKE_BASE   默认 http://127.0.0.1:8787
 *   CHROME_PATH  Chrome 可执行文件路径
 *   SHOT_DIR     截图目录，默认 .shots
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787';
const API = `${BASE}/api`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'niuma-dev';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT_DIR = process.env.SHOT_DIR ?? '.shots';
const PORT = 9333;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cdp(ws) {
  let nextId = 0;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    // 页面里未捕获的异常会让 React 把整棵树卸掉，页面变全白——这里必须喊出来
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      const text = details.exception?.description ?? details.text ?? '(未知异常)';
      pageErrors.push(text.split('\n')[0]);
      console.error('  [页面异常]', text.split('\n').slice(0, 3).join(' / '));
    }

    if (message.id === undefined) return;
    const slot = pending.get(message.id);
    if (slot === undefined) return;
    pending.delete(message.id);
    if (message.error) slot.reject(new Error(JSON.stringify(message.error)));
    else slot.resolve(message.result);
  });

  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      ws.send(JSON.stringify({ id: nextId, method, params }));
    });
}

let passed = 0;
const failures = [];
const pageErrors = [];

function check(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    const line = detail === undefined ? label : `${label} — ${detail}`;
    failures.push(line);
    console.log(`  \u2717 ${line}`);
  }
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      `--remote-debugging-port=${PORT}`,
      '--user-data-dir=' + join(process.env.TEMP ?? '.', 'niuma-ui-smoke'),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let version = null;
  for (let i = 0; i < 40 && version === null; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (version === null) throw new Error('连不上 Chrome 的调试端口');

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (page === undefined) throw new Error('找不到可用的页面 target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 430,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error('页面里报错：' + JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }

  async function waitFor(expression, label) {
    for (let i = 0; i < 60; i += 1) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(200);
    }
    throw new Error('等不到：' + label);
  }

  async function shot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(result.data, 'base64'));
    console.log('  screenshot', join(SHOT_DIR, `${name}.png`));
  }

  const clickByText = (text) => `(() => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
    if (!el) throw new Error('找不到按钮：' + ${JSON.stringify(text)});
    el.click();
    return true;
  })()`;

  /** 在日历上点第 index 个可选的日子。 */
  const pickDay = (index) => `(() => {
    const days = [...document.querySelectorAll('.cal-day:not([disabled])')];
    const day = days[${index}];
    if (!day) return false;
    day.click();
    return true;
  })()`;

  /**
   * 一直翻到「有可选时段」的那一天。
   *
   * 不能写死第几天：换个工作制、或者把 lockMode 改成 overlap
   * （工作日连晚上都锁），哪天有空就完全是另一回事了。
   */
  async function pickDayWithOpenSlot(maxTries = 14) {
    for (let attempt = 0; attempt < maxTries; attempt += 1) {
      const hasOpen = await evaluate(
        "[...document.querySelectorAll('.slot-card')].some((c) => !c.classList.contains('slot-card-frozen') && !c.classList.contains('slot-card-display'))",
      );
      if (hasOpen) return true;

      await evaluate(clickByText('上一步'));
      await waitFor("document.querySelector('.calendar')", '回到日历');
      const picked = await evaluate(pickDay(attempt + 1));
      if (picked !== true) return false;
      await waitFor("document.querySelector('.slot-cards')", '时段页');
    }
    return false;
  }

  const typeInto = (selector, value, index = 0) => `(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) throw new Error('找不到输入框：' + ${JSON.stringify(selector)} + '[' + ${index} + ']');
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`;

  console.log(`\n=== UI 冒烟 ${BASE} ===\n`);

  // 先自愈：站点要是停在「暂停营业」，第一步就会撞到卷帘门
  const bootLogin = await (
    await fetch(`${API}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    })
  ).json();

  const bootConfig = await (await fetch(`${API}/config`)).json();
  if (bootConfig.site.open === false) {
    console.log('  ! 站点还停在「暂停营业」，先恢复接单再开始测\n');
    await fetch(`${API}/admin/site`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bootLogin.token}` },
      body: JSON.stringify({ open: true }),
    });
  }

  /*
    开跑先清一次浏览器存储。
    草稿（draft）是按身份存在 localStorage 里的：上一轮要是中途挂了，
    草稿会留着。这一轮再点同一个时段就等于「取消选中」，
    于是后面的等待全部超时 —— 报出来的错看着像功能坏了，其实是脏数据。
  */
  await send('Page.navigate', { url: BASE });
  await sleep(600);
  await evaluate('localStorage.clear()');

  // 好宝宝 / 父母不用自报家门，直接落到日历；兄弟 / 姐妹还是要问一句。
  console.log('[0] 哪些身份问名号');
  for (const [role, expectName] of [
    ['baby', false],
    ['dadmam', false],
    ['brother', true],
  ]) {
    await send('Page.navigate', { url: `${BASE}/date/${role}` });
    await waitFor('document.querySelector(".ask")', `${role} 的向导`);
    const shape = await evaluate(`(() => ({
      ask: (document.querySelector('.ask') || {}).textContent || '',
      total: (document.querySelector('.wizard-count') || {}).textContent || '',
      nameInput: document.querySelector('.wizard-body input.input-lg') !== null,
    }))()`);
    check(
      `${role} ${expectName ? '要' : '不要'}问名号`,
      shape.nameInput === expectName && shape.ask.includes(expectName ? '名号' : '哪天'),
      JSON.stringify(shape),
    );
    if (!expectName) {
      check(`${role} 的总步数是 5`, shape.total.includes('/ 5'), shape.total);
    }
  }

  // 好宝宝不用填名号，正好顺手验一下「同一句提示，四种口气」
  await send('Page.navigate', { url: `${BASE}/date/baby` });
  await waitFor('document.querySelector(".ask")', '好宝宝的向导');
  await evaluate("document.querySelectorAll('.cal-day:not([disabled])')[0].click()");
  await waitFor("document.querySelector('.slot-cards')", '时段页');
  await evaluate("document.querySelector('.slot-card-display').click()");
  await waitFor("document.querySelector('.modal .art-text')", '早上弹窗');
  const babyMorning = await evaluate("document.querySelector('.modal .art-text').textContent");
  // 好宝宝的文案降过温：软，但不再堆叠字
  check(
    '好宝宝看到的是「软但不腻」那版',
    babyMorning.includes('自然醒') && !babyMorning.includes('睡觉觉'),
    `实际「${String(babyMorning).slice(0, 30)}」`,
  );

  await send('Page.navigate', { url: `${BASE}/date/brother` });
  await waitFor('document.querySelector(".ask")', '向导第一页');

  console.log('[1] 昵称');
  await shot('ui-01-name');
  await evaluate(typeInto('.wizard-body input', '老王'));
  await evaluate(clickByText('下一步'));
  await waitFor('document.querySelector(".calendar")', '日历');

  console.log('[2] 日历：年月下拉 + 切月');
  await shot('ui-02-calendar');

  const readMonth = `(() => {
    const sels = [...document.querySelectorAll('.cal-select')];
    return sels.map((s) => (s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : '')).join(' ');
  })()`;

  const selects = await evaluate("document.querySelectorAll('.cal-select').length");
  check('日历有年 / 月两个下拉栏', selects === 2, `找到 ${selects} 个`);

  const monthBefore = await evaluate(readMonth);
  const shifted = await evaluate(`(() => {
    const next = document.querySelectorAll('.cal-nav')[1];
    if (!next || next.disabled) return null;
    next.click();
    return true;
  })()`);
  await sleep(300);
  const monthAfter = await evaluate(readMonth);
  check(
    '日历能切到下个月',
    shifted === true && monthAfter !== monthBefore,
    `shifted=${shifted} ${monthBefore} → ${monthAfter}`,
  );
  if (shifted === true) {
    await evaluate("document.querySelectorAll('.cal-nav')[0].click()");
    await sleep(300);
  }

  // 下拉栏直接选：挑一个和当前不同的月份
  const pickedBySelect = await evaluate(`(() => {
    const sel = document.querySelectorAll('.cal-select')[1];
    const target = [...sel.options].find((o) => o.value !== sel.value);
    if (!target) return false;
    sel.value = target.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  check('月份下拉能直接选', pickedBySelect === true, '下拉里没有第二个可选月份');
  await shot('ui-02b-calendar-next');
  if (pickedBySelect === true) {
    await evaluate("document.querySelectorAll('.cal-nav')[0].click()");
    await sleep(300);
  }

  console.log('[2b] 身份主题');
  const pageTheme = await evaluate("document.documentElement.dataset.theme || ''");
  check('身份页把主题挂到了 <html> 上', pageTheme === 'brother', `实际「${pageTheme}」`);
  // 主题不只是挂个属性：配色要真的跟着换
  const themedLine = await evaluate(
    "getComputedStyle(document.querySelector('.paper')).borderTopColor",
  );
  check(
    '好兄弟的主题配色真的生效了',
    themedLine === 'rgb(205, 192, 166)',
    `实际 ${themedLine}`,
  );
  // 主题不只是换色：字体也跟着换（这里是声明值，各平台都一样）
  const themedFont = await evaluate(
    "getComputedStyle(document.querySelector('.redhead-title')).fontFamily",
  );
  check(
    '好兄弟的标题走宋体栈',
    themedFont.includes('Songti') || themedFont.includes('SimSun'),
    `实际 ${themedFont.slice(0, 40)}`,
  );
  // 用任意按钮：日历这一步没有「下一步」，只有「上一步」
  const themedBtn = await evaluate(`(() => {
    const el = document.querySelector('.btn-primary') || document.querySelector('.btn');
    return el === null ? '(这个页面没有按钮)' : getComputedStyle(el).borderRadius;
  })()`);
  check('主题接管了按钮的方圆', themedBtn === '4px', `实际 ${themedBtn}`);

  console.log('[3] 选一天 → 时段页');
  await evaluate("document.querySelectorAll('.cal-day:not([disabled])')[0].click()");
  await waitFor('document.querySelector(".slot-cards")', '时段页');

  // 先落到「有可选时段」的一天再断言：换个工作制或 lockMode，哪天有空完全不一样
  const openDayForStats = await pickDayWithOpenSlot();
  check('能找到有可选时段的一天（用于时段页断言）', openDayForStats, '所有日期都没有可选时段');
  if (!openDayForStats) throw new Error('没有可选时段，后面的用例没法跑');

  await shot('ui-03-slot');

  const slotStats = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.slot-card')];
    return {
      total: cards.length,
      display: cards.filter((c) => c.classList.contains('slot-card-display')).length,
      frozen: cards.filter((c) => c.classList.contains('slot-card-frozen')).length,
      open: cards.filter((c) => !c.classList.contains('slot-card-display') && !c.classList.contains('slot-card-frozen')).length,
    };
  })()`);
  check('时段里有「仅供观赏」的早上', slotStats.display === 1, JSON.stringify(slotStats));
  check('时段里有可选的', slotStats.open >= 1, JSON.stringify(slotStats));

  // 冷热是挂在特定时段上的：中午只能热、晚上只能冷、早上永远没有。
  // 这几个位置以前串过（冷热都挂在中午），所以钉死。
  const moodAudit = await evaluate(`[...document.querySelectorAll('.slot-card')].map((c) => ({
    name: (c.querySelector('.slot-card-name') || {}).textContent || '',
    mood: (c.querySelector('.puppet') || {}).className || '',
  }))`);
  const wrongMood = moodAudit
    .filter((cell) => {
      if (cell.name === '早上') return cell.mood.includes('puppet');
      if (cell.name === '中午') return cell.mood.includes('puppet') && !cell.mood.includes('puppet-hot');
      if (cell.name === '晚上') return cell.mood.includes('puppet') && !cell.mood.includes('puppet-cold');
      return false;
    })
    .map((cell) => `${cell.name}:${cell.mood}`);
  check(
    '冷热只出现在该出现的时段（早上无 / 中午只热 / 晚上只冷）',
    wrongMood.length === 0,
    wrongMood.join('、'),
  );

  console.log('[3b] 找一个被工作冻住的时段，验证提示会自己消失');
  let frozenFound = slotStats.frozen > 0;

  for (let attempt = 0; attempt < 3 && !frozenFound; attempt += 1) {
    await evaluate(clickByText('上一步'));
    await waitFor("document.querySelector('.calendar')", '回到日历');
    await evaluate(pickDay(attempt + 1));
    await waitFor("document.querySelector('.slot-cards')", '时段页');
    frozenFound = await evaluate("Boolean(document.querySelector('.slot-card-frozen'))");
  }
  check('能找到被工作冻住的时段', frozenFound, '连着三天都没找到冻住的格子');

  if (frozenFound) {
    await evaluate("document.querySelector('.slot-card-frozen').click()");
    await sleep(300);
    const tipShown = await evaluate("Boolean(document.querySelector('.lock-tip'))");
    // 再点同一个格子，应该立刻关掉
    await evaluate("document.querySelector('.slot-card-frozen').click()");
    await sleep(200);
    const tipToggledOff = await evaluate("Boolean(document.querySelector('.lock-tip'))");
    check('点冻住的时段会弹提示', tipShown);
    check('再点一下同一个格子会关掉提示', !tipToggledOff);

    await evaluate("document.querySelector('.slot-card-frozen').click()");
    await sleep(300);
    await shot('ui-03b-locktip');
    await sleep(3400);
    const tipGone = await evaluate("Boolean(document.querySelector('.lock-tip'))");
    check('提示过几秒会自己消失', !tipGone, '过了 3.7 秒还在');
  }

  console.log('[4] 点早上 → 起床气弹窗');
  await evaluate('document.querySelector(".slot-card-display").click()');
  await waitFor('document.querySelector(".modal")', '早上弹窗');
  await shot('ui-04-morning');
  await evaluate(clickByText('知道了'));
  await sleep(200);

  console.log('[4b] 自己定一个时间（支线）');
  await evaluate(clickByText('自己定一个时间'));
  await waitFor('document.querySelector(".wizard-body input")', '自定义时间页');
  await evaluate(typeInto('.wizard-body input', '凌晨三点', 0));
  await evaluate(typeInto('.wizard-body input', '去江边看日出', 1));
  await evaluate(clickByText('加上这条'));
  await sleep(200);
  await shot('ui-04b-custom');
  await evaluate(clickByText('上一步'));
  await waitFor('document.querySelector(".slot-cards")', '回到时段页');

  console.log('[5] 选时段 → 再点一次取消 → 重新选上');
  const openDay = await pickDayWithOpenSlot();
  check('能找到有可选时段的一天', openDay, '所有可选日期都没有可选时段，后面没法继续');
  if (!openDay) throw new Error('找不到有可选时段的一天');

  await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.slot-card')];
    const card = cards.find(
      (c) => !c.classList.contains('slot-card-frozen') && !c.classList.contains('slot-card-display'),
    );
    if (!card) throw new Error('没有可选的时段，当前卡片：' + cards.map((c) => c.className).join(' | '));
    card.click();
    return true;
  })()`);
  await sleep(200);
  const pickedOnce = await evaluate('document.querySelectorAll(".slot-card-on").length');
  await evaluate('document.querySelector(".slot-card-on").click()');
  await sleep(200);
  const pickedAfterCancel = await evaluate('document.querySelectorAll(".slot-card-on").length');
  check('时段可以选中', pickedOnce === 1, `选中 ${pickedOnce} 个`);
  check('再点一下能取消选中', pickedAfterCancel === 0, `取消后剩 ${pickedAfterCancel} 个`);

  await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.slot-card')];
    const card = cards.find(
      (c) => !c.classList.contains('slot-card-frozen') && !c.classList.contains('slot-card-display'),
    );
    if (!card) throw new Error('没有可选的时段，当前卡片：' + cards.map((c) => c.className).join(' | '));
    card.click();
    return true;
  })()`);
  await sleep(200);
  await evaluate(clickByText('下一步'));
  await waitFor('document.querySelector(".place-field")', '地点页');
  await shot('ui-05-place');

  console.log('[6] 让你定：整段最多 5 秒，追着猛点也会按时停');
  await evaluate('document.querySelector(".btn-dodge").click()');
  await sleep(500);
  const midTransform = await evaluate('getComputedStyle(document.querySelector(".btn-dodge")).transform');
  const box = await evaluate(`(() => {
    const el = document.querySelector('.btn-dodge');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left), top: Math.round(r.top),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      vw: window.innerWidth, vh: window.innerHeight,
    };
  })()`);
  await shot('ui-06-dodging');
  check('按钮确实在动', midTransform !== 'none' && midTransform !== '', midTransform);
  check(
    '跑动时按钮没有跑出视口',
    box !== null && box.left >= -1 && box.top >= -1 && box.right <= box.vw + 1 && box.bottom <= box.vh + 1,
    JSON.stringify(box),
  );

  // 追着猛点几下：这几下都不该算数，也不该把窗口往后延
  for (let i = 0; i < 6; i += 1) {
    await evaluate('document.querySelector(".btn-dodge").click()');
    await sleep(120);
  }
  const decidedDuringBurst = await evaluate('Boolean(document.querySelector(".place-decided"))');
  check('被追着猛点期间不会直接认输', !decidedDuringBurst, '点着点着就认输了');

  // 从第一次点击算起超过 5 秒（躲避窗口），它必须自己停下来 ——
  // 这正是「停不下来」那个 bug。同一次点击算下来已经过了 ~1.2 秒，再等 4.2 秒。
  await sleep(4200);
  const backHome = await evaluate('document.querySelector(".btn-dodge").style.transform');
  const decidedAfterWindow = await evaluate('Boolean(document.querySelector(".place-decided"))');
  check('追着猛点也会按时停下来', backHome === 'translate(0px, 0px)', `还在跑：transform=${backHome}`);
  check('停下来之后仍然没有认输', !decidedAfterWindow);

  await evaluate('document.querySelector(".btn-dodge").click()');
  await sleep(500);
  const decided = await evaluate('Boolean(document.querySelector(".place-decided"))');
  check('躲够之后再点就认输', decided, decided ? '' : '没有出现「由你定」');
  await shot('ui-06b-place-decided');

  await evaluate(clickByText('下一步'));
  await waitFor('document.querySelector(".wizard-body input")', '见面要求 / 留言页');

  console.log('[7] 见面要求 + 留言（合成一页了）');
  await evaluate(typeInto('.wizard-body input', '带一朵鲜花'));
  await evaluate(typeInto('.textarea', '别点太辣的'));
  await shot('ui-07-meeting');
  await evaluate(clickByText('下一步'));
  await waitFor('document.querySelector(".receipt-list")', '确认页');

  console.log('[9] 确认');
  const reviewHasMeeting = await evaluate(
    "document.querySelector('.receipt-list').innerText.includes('带一朵鲜花')",
  );
  check('确认页里能看到见面要求', reviewHasMeeting);
  await shot('ui-07-review');
  await evaluate(clickByText('提交申请'));
  await waitFor('document.querySelector(".receipt")', '回执');

  console.log('[10] 回执');
  await shot('ui-08-receipt');
  const headline = await evaluate('document.querySelector(".art-text").textContent');
  const subline = await evaluate(
    "document.querySelector('.receipt-subline') ? document.querySelector('.receipt-subline').textContent : ''",
  );
  const hasHint = await evaluate('Boolean(document.querySelector(".receipt-hint"))');
  const hasRefill = await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('再填一份'))`);
  // 文案现在是**每个身份一套**的，所以这里断言的是「好兄弟自己的口吻」，
  // 而不是某句固定的话 —— 换了文案不该让测试红，换错了身份才该红。
  check('回执用的是好兄弟自己的文案', headline.includes('牛马在审'), headline);
  check('副文案也跟着是好兄弟的', subline.includes('审完就来找你'), subline);
  check('回执上给了「有问题微信联系牛马」的提示', hasHint);
  check('回执上没有「再填一份」', !hasRefill);

  const urlAfterSubmit = await evaluate('location.pathname');
  check('提交后跳到状态页 /status/brother', urlAfterSubmit === '/status/brother', urlAfterSubmit);

  // ---------- 驳回后必须能真的重新填写 ----------
  console.log('[11] 驳回后重填（防死循环回归测试）');

  const { token } = await (
    await fetch(`${API}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    })
  ).json();

  const deviceId = await evaluate("localStorage.getItem('niumadate.deviceId')");
  const listed = await (
    await fetch(`${API}/admin/submissions?role=brother`, {
      headers: { authorization: `Bearer ${token}` },
    })
  ).json();
  const mine = listed.items.find((item) => item.deviceId === deviceId);

  if (mine === undefined) {
    check('能在后台找到刚提交的那条', false, '按 deviceId 没找到');
  } else {
    check('能在后台找到刚提交的那条', true);

    // ---------- 后台列表的排序与搜索 ----------
    console.log('[10b] 后台：审批中优先 + 关键字搜索');
    await evaluate(`localStorage.setItem('niumadate.admin.token', ${JSON.stringify(token)})`);
    await send('Page.navigate', { url: `${BASE}/admin` });
    await waitFor("document.querySelector('.input-search')", '后台审批列表');
    await sleep(500);

    const kw = '晚上';
    await evaluate(`(() => {
      const el = document.querySelector('.input-search');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(kw)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);

    const searched = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.admin-item')];
      const pendingFlags = rows.map((r) => r.querySelector('.badge-pending') !== null);
      const lastPending = pendingFlags.lastIndexOf(true);
      const firstHandled = pendingFlags.indexOf(false);
      return {
        count: rows.length,
        miss: rows.filter((r) => !r.innerText.toLowerCase().includes(${JSON.stringify(kw)})).length,
        pendingFirst: lastPending === -1 || firstHandled === -1 || lastPending < firstHandled,
      };
    })()`);
    check('按关键字能搜出若干条', searched.count > 0, `搜「${kw}」一条都没有`);
    check('搜出来的每一条都真的含关键字', searched.miss === 0, `有 ${searched.miss} 条不含`);
    check('审批中的排在已处理之前', searched.pendingFirst, '顺序不对');
    await shot('ui-10b-admin-search');

    const adminUi = await evaluate(`(() => ({
      tabBadge: (document.querySelector('.tab-badge') || {}).textContent || '',
      title: document.title,
      inlineButtons: document.querySelectorAll('.admin-item-actions .btn-mini').length,
      stamps: document.querySelectorAll('.admin-item-stamp').length,
    }))()`);
    check(
      '标签页上有待审批数量角标',
      adminUi.tabBadge !== '' && Number(adminUi.tabBadge) > 0,
      `角标是「${adminUi.tabBadge}」`,
    );
    check(
      '浏览器标题也带上了数量',
      adminUi.title.startsWith('('),
      `标题是「${adminUi.title}」`,
    );
    check('列表行里有行内批准 / 驳回', adminUi.inlineButtons >= 2, `只有 ${adminUi.inlineButtons} 个`);
    check('列表行里显示了提交时间', adminUi.stamps > 0, '一个都没有');

    // 按约会日期排序 / 日期筛选
    const hasDateSort = await evaluate(
      "[...document.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === 'meet'))",
    );
    const hasDateWindow = await evaluate(
      "[...document.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === '7'))",
    );
    check('筛选栏有「按约会日期」', hasDateSort, '没找到那个下拉');
    check('筛选栏有日期窗口（未来 7 天）', hasDateWindow, '没找到');

    await evaluate(`(() => {
      const sels = [...document.querySelectorAll('select')];
      const target = sels.find((s) => [...s.options].some((o) => o.value === 'meet'));
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(target, 'meet');
      target.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(500);
    const sortHint = await evaluate("document.querySelector('.list-order-hint').textContent");
    check('切到按约会日期后，排序说明跟着变', sortHint.includes('约会日期'), sortHint.slice(0, 30));
    await shot('ui-10d-date-sort');

    const searchUi = await evaluate(`(() => {
      const input = document.querySelector('.input-search');
      const icon = document.querySelector('.search-icon');
      const btn = document.querySelector('.icon-btn');
      return {
        hasIcon:
          icon !== null &&
          input !== null &&
          icon.getBoundingClientRect().left > input.getBoundingClientRect().left,
        iconButton: btn !== null && btn.querySelector('svg') !== null && btn.textContent.trim() === '',
      };
    })()`);
    check('搜索框里有个放大镜', searchUi.hasIcon, '没找到，或者画到框外面去了');
    check('刷新按钮是纯图标（没有文字）', searchUi.iconButton, '还有文字或者没有 svg');

    // 展开一条，看「复制回复话术」
    await evaluate("document.querySelector('.admin-item-main').click()");
    await sleep(400);
    const hasCopy = await evaluate("Boolean(document.querySelector('.copy-reply'))");
    check('详情里有「复制回复话术」', hasCopy, '没找到');

    // 牛马年报
    await evaluate(clickByText('牛马年报'));
    await sleep(900);
    const reportOk = await evaluate(`(() => {
      const el = document.querySelector('.report');
      return el !== null && el.innerText.length > 30;
    })()`);
    check('牛马年报能打开并算出内容', reportOk, '年报是空的');
    await shot('ui-10c-report');
    await evaluate(clickByText('审批列表'));
    await sleep(300);

    await fetch(`${API}/admin/submissions/${mine.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      // 故意写成两行：验证换行会被保留，而不是折叠成空格
      body: JSON.stringify({ status: 'cancelled', adminNote: '那天我要加班。\n改天一定补偿你。' }),
    });

    await send('Page.navigate', { url: `${BASE}/status/brother` });
    await waitFor("document.querySelector('.receipt')", '驳回页');
    await shot('ui-09-rejected');

    const noteVisible = await evaluate("document.body.innerText.includes('那天我要加班')");
    check('驳回页一定展示牛马回复', noteVisible, '页面上找不到审批意见');

    const noteStyle = await evaluate(`(() => {
      const el = document.querySelector('.dd-note');
      if (el === null) return null;
      return { whiteSpace: getComputedStyle(el).whiteSpace, lines: el.innerText.split(String.fromCharCode(10)).length };
    })()`);
    check(
      '多行审批意见按原样换行显示',
      noteStyle !== null && noteStyle.whiteSpace === 'pre-wrap' && noteStyle.lines === 2,
      JSON.stringify(noteStyle),
    );

    // 点「重新填一份」→ 回入口页 → 再选同一个身份，必须进填写页而不是又回驳回页
    await evaluate(clickByText('重新填一份'));
    await waitFor("document.querySelector('.id-grid')", '入口页');
    await evaluate(clickByText('好兄弟'));
    await waitFor("document.querySelector('.wizard-body')", '填写页');

    const backOnWizard = await evaluate("Boolean(document.querySelector('.ask'))");
    const stillRejected = await evaluate(
      "document.querySelector('.art-text') ? document.querySelector('.art-text').textContent : ''",
    );
    check('驳回后点重新填一份，再选同一身份能进填写页', backOnWizard, '又回到了驳回页');
    check('没有再次显示「这次没约上」', !stillRejected.includes('这次没约上'), stillRejected);
    await shot('ui-10-refill');
  }

  // ---------- 暂停营业 ----------
  console.log('[12] 暂停营业：卷帘门 + 状态页仍然可用');

  /** 只动总开关，绝不整份覆盖配置 —— 整份 PUT 会把别处的设置一起冲掉。 */
  const setSiteOpen = (open) =>
    fetch(`${API}/admin/site`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ open }),
    });

  const configBefore = await (await fetch(`${API}/config`)).json();
  await setSiteOpen(false);

  await send('Page.navigate', { url: `${BASE}/` });
  await waitFor("document.querySelector('.shop-shutter')", '卷帘门');
  await sleep(3600);
  await shot('ui-11-closed');

  const closed = await evaluate(`(() => ({
    shutter: Boolean(document.querySelector('.shop-shutter')),
    sign: document.querySelector('.shop-sign-inner') ? document.querySelector('.shop-sign-inner').textContent : '',
    idCards: Boolean(document.querySelector('.id-grid')),
    hint: Boolean(document.querySelector('.receipt-hint')),
  }))()`);
  check('暂停营业页有卷帘门', closed.shutter);
  check('帘子上挂着「暂停营业」', closed.sign === '暂停营业', closed.sign);
  check('暂停营业时不再显示身份卡', !closed.idCards);
  check('暂停营业页留了微信联系方式', closed.hint);

  // 已经交过单子的人不该被拦在外面，但也不能重新开一单
  await send('Page.navigate', { url: `${BASE}/status/brother` });
  await waitFor("document.querySelector('.receipt')", '状态页');
  const statusUrl = await evaluate('location.pathname');
  check('暂停营业时已交过单的人仍能看到自己的状态', statusUrl === '/status/brother', statusUrl);

  const closedState = await evaluate(`(() => ({
    refill: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('重新填一份')),
    reason: document.querySelector('.art-text') ? document.querySelector('.art-text').textContent : '',
    notice: document.body.innerText.includes('这会儿没法重新填'),
  }))()`);
  check('暂停营业时驳回页不再给「重新填一份」', !closedState.refill);
  check('驳回原因照样能看到', closedState.reason !== '', closedState.reason);
  check('驳回页说明了为什么现在不能重填', closedState.notice);

  await setSiteOpen(true);

  const configAfter = await (await fetch(`${API}/config`)).json();
  check('跑完之后站点已恢复接单', configAfter.site.open === true, '站点被留在关闭状态了');
  // 整份比对：测试不该在配置上留下任何别的痕迹
  check(
    '跑完之后配置与开跑前完全一致',
    JSON.stringify(configAfter) === JSON.stringify(configBefore),
    '配置被测试改动了，下次会污染别人',
  );

  if (pageErrors.length > 0) {
    check('页面全程没有未捕获异常', false, pageErrors.join(' ; '));
  } else {
    check('页面全程没有未捕获异常', true);
  }

  console.log(`\n=== 通过 ${passed} 项，失败 ${failures.length} 项 ===`);
  if (failures.length > 0) {
    console.log('\n失败明细：');
    for (const line of failures) console.log(`  - ${line}`);
    ws.close();
    chrome.kill();
    process.exit(1);
  }
  console.log('全部走通 ✅\n');

  ws.close();
  chrome.kill();
}

main().catch((error) => {
  console.error('\nUI 冒烟失败：', error.message);
  process.exit(1);
});
