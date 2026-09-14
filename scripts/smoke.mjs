/**
 * 接口冒烟测试：不需要任何测试框架，直接 node scripts/smoke.mjs
 *
 * 用法：
 *   1. 先起后端：pnpm --filter @niumadate/server run dev
 *   2. 另开一个终端：pnpm smoke
 *
 * 环境变量：
 *   SMOKE_BASE       后端地址，默认 http://127.0.0.1:8787
 *   ADMIN_PASSWORD   后台口令，默认 niuma-dev
 */

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787';
const API = `${BASE}/api`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'niuma-dev';
const DEVICE_ID = `smoke-device-${Date.now()}`;

let passed = 0;
const failures = [];

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

async function req(method, path, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = null;
  if (text !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { status: response.status, payload };
}

function dateKey(offset) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

function isoWeekday(offset) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  const weekday = day.getDay();
  return weekday === 0 ? 7 : weekday;
}

/** 后端可能刚启动，先等端口就绪，避免误报 ECONNREFUSED。 */
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${API}/health`);
      if (response.ok) return true;
    } catch {
      // 还没起来，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  console.log(`\n=== 冒烟测试 ${API} ===\n`);

  if (!(await waitForServer())) {
    console.error(`等不到后端 ${API}/health，请先执行：pnpm --filter @niumadate/server run dev\n`);
    process.exit(1);
  }

  // ---- 前置检查 ----
  // 测试会开关总开关、临时禁用某个身份。要是上一轮没收拾干净，
  // 后面的用例会报一堆看不懂的错，所以这里先明确报出来。
  const bootLogin = await req('POST', '/admin/login', { body: { password: ADMIN_PASSWORD } });
  const bootToken = bootLogin.payload?.token;
  const bootConfig = await req('GET', '/config');
  const originalConfig = bootConfig.payload;

  if (originalConfig?.site?.open === false) {
    console.log('  ! 站点还停在「暂停营业」，先恢复接单再开始测\n');
    await req('PUT', '/admin/site', { token: bootToken, body: { open: true } });
    originalConfig.site.open = true;
  }

  const closedRoles = (originalConfig?.roles ?? [])
    .filter((role) => role.enabled === false)
    .map((role) => role.key);
  check(
    '前置条件：四个身份都是开启的',
    closedRoles.length === 0,
    `这些身份是关着的：${closedRoles.join(', ')}。多半是上一轮测试没收拾干净`,
  );

  // ---------- 公开接口 ----------
  console.log('[公开] 健康检查与配置');
  const health = await req('GET', '/health');
  check('GET /health 返回 200', health.status === 200, `实际 ${health.status}`);
  // 公开探针不该把「收了多少单」告诉路过的人
  check('health 不再暴露提交条数', health.payload?.submissions === undefined);

  const configRes = await req('GET', '/config');
  const config = configRes.payload;
  check('GET /config 返回 200', configRes.status === 200, `实际 ${configRes.status}`);
  check('配置有 4 个身份', config?.roles?.length === 4, `实际 ${config?.roles?.length}`);
  // 身份名字是后台随时能改的（就有人把 DAD&MUM 改成了英式拼法 DAD&MUM），
  // 所以这里只断言「四个身份都有非空名字」—— 断言写死某个字样，
  // 用户一改名就红，报出来像功能坏了，其实只是文案变了。
  check(
    '四个身份都有非空名字',
    config.roles.length === 4 &&
      config.roles.every((role) => typeof role.label === 'string' && role.label.trim() !== ''),
    JSON.stringify(config.roles.map((role) => role.label)),
  );

  // 每个身份一套文案：四种口气必须真的不一样，不能是同一句话抄四遍
  const voices = config.roles.map((role) => role.copies?.pending ?? '');
  check('四个身份各有各的文案', new Set(voices).size === 4, JSON.stringify(voices));
  // 好宝宝的文案刻意降过温：可爱但不用叠字堆
  check(
    '好宝宝的文案不带叠字',
    config.roles.find((role) => role.key === 'baby')?.copies?.pending?.includes('宝宝') !== true,
    config.roles.find((role) => role.key === 'baby')?.copies?.pending,
  );
  check(
    '好姐妹的文案带语气词',
    config.roles.find((role) => role.key === 'sister')?.copies?.pending?.includes('～') === true,
  );
  check(
    'DAD&MUM 的口吻是公文',
    config.roles.find((role) => role.key === 'dadmam')?.copies?.pending?.includes('审阅') === true,
  );
  check(
    '好兄弟的口吻直来直去',
    config.roles.find((role) => role.key === 'brother')?.copies?.pending === '牛马在审，别急。',
  );

  /**
   * 按当前配置算「这天这个时段能不能选」。
   *
   * 必须自己算，不能写死第几天 + evening：
   * 换个工作制、或者把 lockMode 改成 overlap（工作日连晚上都锁），
   * 原来的写死值就全错了 —— 这一条已经踩过两次。
   */
  function slotLocked(slot, weekday) {
    const active =
      config.schedule.presets.find((preset) => preset.key === config.schedule.active) ??
      config.schedule.presets[0];
    if (!active.workdays.includes(weekday)) return false;

    const toMin = (hm) => {
      const [h, m] = hm.split(':').map(Number);
      return h * 60 + m;
    };
    const start = toMin(slot.start);
    const end = toMin(slot.end);
    const workStart = toMin(active.workStart);
    const workEnd = toMin(active.workEnd);

    return config.schedule.lockMode === 'overlap'
      ? start < workEnd && workStart < end
      : start >= workStart && end <= workEnd;
  }

  /** 找一个（可选 = false，或可选 = true）的日期 + 时段。 */
  function findSlot(wantLocked) {
    for (let offset = 0; offset < config.dateRangeDays; offset += 1) {
      const weekday = isoWeekday(offset);
      for (const slot of config.slots) {
        if (!slot.selectable) continue;
        if (slotLocked(slot, weekday) === wantLocked) {
          return { date: dateKey(offset), slot: slot.key };
        }
      }
    }
    return null;
  }

  const freeSlot = findSlot(false);
  const frozenSlot = findSlot(true);
  check('按当前配置能找到可选的时段', freeSlot !== null, '所有日期都没有可选时段');
  if (freeSlot === null) {
    console.error('\n当前配置下没有任何可选时段，后面的用例没法跑。检查 schedule / lockMode。\n');
    process.exit(1);
  }

  // ---------- 提交 ----------
  console.log('\n[公开] 提交');
  const goodDate = freeSlot.date;
  const created = await req('POST', '/submissions', {
    body: {
      role: 'brother',
      name: '冒烟测试员',
      deviceId: DEVICE_ID,
      slots: [{ date: goodDate, slot: freeSlot.slot }],
      customTimes: [],
      place: null,
      message: '来自 smoke.mjs',
      meetingNote: '带一朵鲜花',
    },
  });
  check('合法提交返回 201', created.status === 201, `实际 ${created.status} ${JSON.stringify(created.payload)}`);
  check('返回记录带 id', typeof created.payload?.id === 'string');
  check(
    '好友填的见面要求存下来了',
    created.payload?.meetingNote === '带一朵鲜花',
    JSON.stringify(created.payload?.meetingNote),
  );

  const longMeeting = await req('POST', '/submissions', {
    body: {
      role: 'brother',
      name: '冒烟测试员',
      deviceId: DEVICE_ID,
      slots: [{ date: goodDate, slot: freeSlot.slot }],
      customTimes: [],
      place: '某处',
      message: '',
      meetingNote: 'x'.repeat(80),
    },
  });
  check('见面要求过长被拒绝', longMeeting.status === 400, `实际 ${longMeeting.status}`);

  const locked = await req('POST', '/submissions', {
    body: {
      role: 'brother',
      name: '冒烟测试员',
      deviceId: DEVICE_ID,
      slots: frozenSlot === null ? [] : [{ date: frozenSlot.date, slot: frozenSlot.slot }],
      customTimes: frozenSlot === null ? [{ date: goodDate, text: '占位' }] : [],
      place: '某处',
      message: '',
    },
  });
  check(
    '提交被冻住的时段被拒绝（400 LOCKED_SLOT）',
    frozenSlot !== null && locked.status === 400 && locked.payload?.error?.code === 'LOCKED_SLOT',
    frozenSlot === null ? '当前配置下没有任何被冻住的时段' : `实际 ${locked.status} ${JSON.stringify(locked.payload)}`,
  );

  // 早上是「只放出来看看」，任何一天都不该能选
  const morning = await req('POST', '/submissions', {
    body: {
      role: 'brother',
      name: '冒烟测试员',
      deviceId: DEVICE_ID,
      slots: [{ date: goodDate, slot: 'morning' }],
      customTimes: [],
      place: '某处',
      message: '',
    },
  });
  check(
    '早上只放出来看看，永远不可选（400 LOCKED_SLOT）',
    morning.status === 400 && morning.payload?.error?.code === 'LOCKED_SLOT',
    `实际 ${morning.status} ${JSON.stringify(morning.payload)}`,
  );

  const empty = await req('POST', '/submissions', {
    body: { role: 'brother', name: 'X', deviceId: DEVICE_ID, slots: [], customTimes: [], place: '甲', message: '' },
  });
  check('一个时间都不选被拒绝', empty.status === 400, `实际 ${empty.status}`);

  const noPlace = await req('POST', '/submissions', {
    body: { role: 'brother', name: 'X', deviceId: DEVICE_ID, slots: [{ date: goodDate, slot: freeSlot.slot }], customTimes: [], place: '', message: '' },
  });
  check('不填地点也不点「让你定」被拒绝', noPlace.status === 400, `实际 ${noPlace.status}`);

  const badRole = await req('POST', '/submissions', {
    body: { role: 'stranger', name: 'X', deviceId: DEVICE_ID, slots: [], customTimes: [{ date: goodDate, text: '随便' }], place: '甲', message: '' },
  });
  check('非法身份被拒绝', badRole.status === 400, `实际 ${badRole.status}`);

  const custom = await req('POST', '/submissions', {
    body: {
      role: 'sister',
      name: '自定义小妹',
      deviceId: DEVICE_ID,
      slots: [],
      customTimes: [{ date: goodDate, text: '凌晨三点看日出' }],
      place: '让你定的那家',
      message: '只有这个时间有空',
    },
  });
  check('只用自定义时间也能提交', custom.status === 201, `实际 ${custom.status} ${JSON.stringify(custom.payload)}`);

  const mine = await req('GET', `/submissions/me?deviceId=${DEVICE_ID}&role=brother`);
  check('查自己的状态返回最近一条', mine.status === 200 && mine.payload?.submission?.name === '冒烟测试员');

  // ---------- 后台 ----------
  console.log('\n[后台] 登录与鉴权');
  const wrongLogin = await req('POST', '/admin/login', { body: { password: 'definitely-wrong' } });
  check('错误口令返回 401', wrongLogin.status === 401, `实际 ${wrongLogin.status}`);

  const login = await req('POST', '/admin/login', { body: { password: ADMIN_PASSWORD } });
  const token = login.payload?.token;

  // 被限流时后面的后台用例会全变成 401，看起来像「token 失效」，很难往限流上想。
  // 所以这里直接说清楚，并立刻停 —— 别拿 25 个看不懂的失败埋掉真正的原因。
  if (login.status === 429) {
    console.error('\n登录被限流了（429）。等十来分钟，或者把 LOGIN_RATE_MAX 调大再跑。\n');
    process.exit(1);
  }

  check('正确口令拿到 token', login.status === 200 && typeof token === 'string', `实际 ${login.status}`);

  const noAuth = await req('GET', '/admin/submissions');
  check('不带 token 访问后台返回 401', noAuth.status === 401, `实际 ${noAuth.status}`);

  const badAuth = await req('GET', '/admin/submissions', { token: 'a.b' });
  check('伪造 token 返回 401', badAuth.status === 401, `实际 ${badAuth.status}`);

  console.log('\n[后台] 审批');
  const list = await req('GET', '/admin/submissions', { token });
  check('列表返回 200 且有 total', list.status === 200 && typeof list.payload?.total === 'number');

  const byRole = await req('GET', '/admin/submissions?role=sister', { token });
  check(
    '按身份筛选只返回 sister',
    byRole.status === 200 && byRole.payload.items.every((item) => item.role === 'sister'),
  );

  const targetId = created.payload.id;
  const patched = await req('PATCH', `/admin/submissions/${targetId}`, {
    token,
    body: { status: 'accepted', adminNote: '已经安排上了' },
  });
  check('改状态成功', patched.status === 200 && patched.payload?.status === 'accepted');

  const badStatus = await req('PATCH', `/admin/submissions/${targetId}`, { token, body: { status: 'nonsense' } });
  check('非法状态被拒绝', badStatus.status === 400, `实际 ${badStatus.status}`);

  const noted = await req('PATCH', `/admin/submissions/${targetId}`, {
    token,
    body: { adminNote: '记得带伞', meetingNote: '后台不该改这个' },
  });
  check(
    '能写审批意见',
    noted.status === 200 && noted.payload?.adminNote === '记得带伞',
    JSON.stringify(noted.payload),
  );
  check(
    '后台改不动好友填的见面要求',
    noted.payload?.meetingNote === '带一朵鲜花',
    JSON.stringify(noted.payload?.meetingNote),
  );

  console.log('\n[后台] 批量操作');
  const makeForBatch = async (name) =>
    req('POST', '/submissions', {
      body: {
        role: 'brother',
        name,
        deviceId: `${DEVICE_ID}-batch`,
        slots: [{ date: goodDate, slot: freeSlot.slot }],
        customTimes: [],
        place: '某处',
        message: '',
      },
    });

  const first = await makeForBatch('批量一号');
  const second = await makeForBatch('批量二号');
  const batchIds = [first.payload.id, second.payload.id];

  const batchAccept = await req('POST', '/admin/submissions/batch', {
    token,
    body: { ids: batchIds, action: 'accepted' },
  });
  check(
    '批量批准返回受影响条数',
    batchAccept.status === 200 && batchAccept.payload?.affected === 2,
    JSON.stringify(batchAccept.payload),
  );

  const afterBatch = await req('GET', `/admin/submissions/${batchIds[0]}`, { token });
  check('批量批准后状态确实变了', afterBatch.payload?.status === 'accepted');

  const emptyBatch = await req('POST', '/admin/submissions/batch', { token, body: { ids: [], action: 'delete' } });
  check('空 ids 被拒绝', emptyBatch.status === 400, `实际 ${emptyBatch.status}`);

  const badAction = await req('POST', '/admin/submissions/batch', {
    token,
    body: { ids: batchIds, action: 'nonsense' },
  });
  check('非法批量动作被拒绝', badAction.status === 400, `实际 ${badAction.status}`);

  const batchDelete = await req('POST', '/admin/submissions/batch', {
    token,
    body: { ids: batchIds, action: 'delete' },
  });
  check(
    '批量删除返回受影响条数',
    batchDelete.status === 200 && batchDelete.payload?.affected === 2,
    JSON.stringify(batchDelete.payload),
  );

  const exported = await req('GET', '/admin/submissions/export', { token });
  check('导出返回 items 数组', exported.status === 200 && Array.isArray(exported.payload?.items));

  console.log('\n[后台] 配置改动立即生效');
  const flipped = config.roles.map((role) => (role.key === 'baby' ? { ...role, enabled: false } : role));
  const saved = await req('PUT', '/admin/config', { token, body: { ...config, roles: flipped } });
  check('保存配置返回 200', saved.status === 200, `实际 ${saved.status}`);

  const publicAfter = await req('GET', '/config');
  check(
    '公开配置里 baby 已关闭',
    publicAfter.payload?.roles?.find((role) => role.key === 'baby')?.enabled === false,
  );

  const closedSubmit = await req('POST', '/submissions', {
    body: { role: 'baby', name: 'X', deviceId: DEVICE_ID, slots: [{ date: goodDate, slot: freeSlot.slot }], customTimes: [], place: '甲', message: '' },
  });
  check(
    '关闭的身份提交被拒（403 ROLE_CLOSED）',
    closedSubmit.status === 403 && closedSubmit.payload?.error?.code === 'ROLE_CLOSED',
    `实际 ${closedSubmit.status} ${JSON.stringify(closedSubmit.payload)}`,
  );

  console.log('\n[后台] 暂停营业');
  const closed = await req('PUT', '/admin/site', { token, body: { open: false } });
  check('能关掉总开关', closed.status === 200 && closed.payload?.site?.open === false, `实际 ${closed.status}`);

  const badOpen = await req('PUT', '/admin/site', { token, body: { open: 'yes' } });
  check('总开关只接受布尔值', badOpen.status === 400, `实际 ${badOpen.status}`);

  const blocked = await req('POST', '/submissions', {
    body: {
      role: 'brother',
      name: '暂停营业测试',
      deviceId: DEVICE_ID,
      slots: [{ date: goodDate, slot: freeSlot.slot }],
      customTimes: [],
      place: '某处',
      message: '',
    },
  });
  check(
    '暂停营业时提交被拒（403 SITE_CLOSED）',
    blocked.status === 403 && blocked.payload?.error?.code === 'SITE_CLOSED',
    `实际 ${blocked.status} ${JSON.stringify(blocked.payload)}`,
  );

  // 配置的复原统一放在最后（见「收尾自检」）——中间还有别的用例会改配置，
  // 在这里就复原的话，后面改的就没人管了。

  console.log('\n[后台] 删除');
  const removed = await req('DELETE', `/admin/submissions/${targetId}`, { token });
  check('删除返回 200', removed.status === 200, `实际 ${removed.status}`);
  const gone = await req('GET', `/admin/submissions/${targetId}`, { token });
  check('删掉之后查不到（404）', gone.status === 404, `实际 ${gone.status}`);

  console.log('\n[后台] 空月份与恢复默认');
  // 月份全不选 = 那个时段永远不显示冷热，**不能**被悄悄替换成默认三月份
  const emptyMonths = await req('PUT', '/admin/config', {
    token,
    body: { ...config, season: { hotMonths: [], coldMonths: [] } },
  });
  check(
    '月份全不选不会被改回默认',
    Array.isArray(emptyMonths.payload?.season?.hotMonths) &&
      emptyMonths.payload.season.hotMonths.length === 0,
    JSON.stringify(emptyMonths.payload?.season),
  );

  // 同一类问题：工作日的七天也是列表，全不选不能被偷偷改回默认
  const emptyWorkdays = await req('PUT', '/admin/config', {
    token,
    body: {
      ...config,
      schedule: {
        ...config.schedule,
        presets: config.schedule.presets.map((preset, index) =>
          index === 0 ? { ...preset, workdays: [] } : preset,
        ),
      },
    },
  });
  check(
    '工作日全不选不会被改回默认',
    Array.isArray(emptyWorkdays.payload?.schedule?.presets?.[0]?.workdays) &&
      emptyWorkdays.payload.schedule.presets[0].workdays.length === 0,
    JSON.stringify(emptyWorkdays.payload?.schedule?.presets?.[0]?.workdays),
  );

  // ---------- 先把「这个冒烟自己改过的几块」还原 ----------
  // 改过的只有：身份的开关、冷热月份、工作制的上班日、总开关。
  // 先还原它们，后面才好判断「配置有没有被**别人**动过」。
  const live = (await req('GET', '/config')).payload;
  await req('PUT', '/admin/config', {
    token,
    body: {
      ...live,
      site: { ...live.site, open: true },
      roles: originalConfig.roles,
      season: originalConfig.season,
      schedule: originalConfig.schedule,
    },
  });

  /**
   * 基准线：测试自己收拾干净之后、**别人动过就带着别人的**那一份。
   * 最后的比对要跟它比，而不是跟开跑时的快照比 —— 后者永远相等，等于没测。
   */
  const baseline = (await req('GET', '/config')).payload;
  const untouched = JSON.stringify(baseline) === JSON.stringify(originalConfig);

  if (!untouched) {
    console.log('\n  ! 配置在测试期间被别的东西改过（你在后台改的、或者另一个脚本），');
    console.log('    跳过「恢复默认」这组破坏性用例 —— 它会把整份配置冲掉，连你的改动一起冲。');
  } else {
    const reset = await req('POST', '/admin/config/reset', { token });
    check(
      '能一键恢复默认配置',
      reset.status === 200 && reset.payload?.site?.open === true && reset.payload?.roles?.length === 4,
      `实际 ${reset.status}`,
    );

    // 复原成基准线。只有确认过「没人动过」才走到这里，所以整份盖回去是安全的。
    await req('PUT', '/admin/config', { token, body: baseline });
  }

  const finalConfig = await req('GET', '/config');
  check(
    '跑完之后站点已恢复接单',
    finalConfig.payload?.site?.open === true,
    '站点被留在关闭状态了，会污染下一轮',
  );
  // 整份比对：和「基准线」比，不是和开跑时的快照比 ——
  // 跟快照比永远相等（那份就是刚写回去的），等于没测。
  const drifted = [...new Set([...Object.keys(baseline ?? {}), ...Object.keys(finalConfig.payload ?? {})])]
    .filter((key) => JSON.stringify(baseline?.[key]) !== JSON.stringify(finalConfig.payload?.[key]))
    .map((key) => `${key}: ${JSON.stringify(baseline?.[key])} → ${JSON.stringify(finalConfig.payload?.[key])}`);
  check('跑完之后配置与测试前一致', drifted.length === 0, drifted.join('; ').slice(0, 300));

  // ---------- 汇总 ----------
  console.log(`\n=== 通过 ${passed} 项，失败 ${failures.length} 项 ===`);
  if (failures.length > 0) {
    console.log('\n失败明细：');
    for (const line of failures) console.log(`  - ${line}`);
    process.exit(1);
  }
  console.log('全部通过 ✅\n');
}

main().catch((error) => {
  console.error('\n冒烟测试跑挂了：', error);
  process.exit(1);
});
