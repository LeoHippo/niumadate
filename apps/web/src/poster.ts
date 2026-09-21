import type { RoleKey } from '@niumadate/shared';

/**
 * 把请柬画成一张图片。
 *
 * **为什么值得做**：一个只能看的网页，和一个能存进相册、能发出去、能留着的请柬，
 * 分量完全不一样。「可收藏」本身就是向往感的一部分。
 *
 * **为什么手绘 Canvas 而不引 html2canvas**：那个库很大（几百 KB），
 * 我们只要一张固定版式的卡片，手绘反而更可控、更好看 —— 而且零依赖。
 *
 * 尺寸 1080×1440（3:4）—— 手机相册、朋友圈、微信都合适。
 */

export interface PosterPalette {
  paper: string;
  edge: string;
  ink: string;
  inkSoft: string;
  accent: string;
  accentDeep: string;
}

export interface PosterInput {
  role: RoleKey;
  roleEmoji: string;
  inviteeName: string;
  dateText: string;
  timeText: string;
  place: string;
  activity: string;
  hostName: string;
  body: string;
  days: number;
  palette: PosterPalette;
}

const W = 1080;
const H = 1440;

/** 标题的字距靠一个字一个字画出来 —— canvas 没有 letter-spacing。 */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  tracking: number,
): void {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  let x = centerX - total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i] ?? '', x, y);
    x += (widths[i] ?? 0) + tracking;
  }
}

/**
 * 一行里塞不下的文字自动折行。
 *
 * 中文排版有一条：**标点不能出现在行首**（叫"避头点"）。
 * 第一版没管这个，结果正文第二行是「，人来就行。」—— 逗号顶在行首，很业余。
 * 所以折行时如果下一个字是标点，就把它**跟着上一行走**（让上一行稍微超一点点宽，
 * 比标点顶行首好看得多）。
 */
const NO_LINE_START = '，。、；：？！）】》」』…—～·';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    const next = line + ch;
    const tooWide = ctx.measureText(next).width > maxWidth && line !== '';
    // 该断行、但下一个字是标点 → 让它跟着这一行走
    if (tooWide && !NO_LINE_START.includes(ch)) {
      out.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line !== '') out.push(line);
  return out;
}

export function drawPoster(input: PosterInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return canvas;

  const p = input.palette;
  const titleFont = `600 62px "Songti SC", "STSong", "SimSun", serif`;
  const labelFont = `28px "PingFang SC", "Microsoft YaHei", sans-serif`;
  const valueFont = `600 44px "Songti SC", "STSong", "SimSun", serif`;
  const smallFont = `26px "PingFang SC", "Microsoft YaHei", sans-serif`;

  // ---------- 底：纸色 + 四角稍暗，像一张被灯照着的纸 ----------
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, W, H);

  const vignette = ctx.createRadialGradient(W / 2, H * 0.42, 120, W / 2, H * 0.42, H * 0.78);
  vignette.addColorStop(0, 'rgba(255,255,255,0.34)');
  vignette.addColorStop(1, 'rgba(90,70,40,0.16)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // 一道很淡的斜光，画面上就不那么平
  const sheen = ctx.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
  sheen.addColorStop(0.42, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.14)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  // ---------- 双线外框 ----------
  ctx.strokeStyle = p.edge;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, W - 112, H - 112);
  ctx.globalAlpha = 0.32;
  ctx.strokeRect(70, 70, W - 140, H - 140);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // ---------- 抬头 ----------
  ctx.font = `64px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.fillText(input.roleEmoji, W / 2, 232);

  ctx.fillStyle = p.accent;
  ctx.font = titleFont;
  drawTracked(ctx, '邀请函', W / 2, 322, 18);

  // 分隔线：中间实、两头虚
  const rule = ctx.createLinearGradient(180, 0, W - 180, 0);
  rule.addColorStop(0, 'rgba(0,0,0,0)');
  rule.addColorStop(0.5, p.accent);
  rule.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(180, 366);
  ctx.lineTo(W - 180, 366);
  ctx.stroke();

  // ---------- 称呼 ----------
  ctx.fillStyle = p.inkSoft;
  ctx.font = smallFont;
  const hello = input.inviteeName === '' ? '这一封是给你的' : `${input.inviteeName}，这一封是给你的`;
  ctx.fillText(hello, W / 2, 426);

  // ---------- 四行事实 ----------
  const rows: { label: string; value: string; strong: boolean }[] = [
    { label: '时间', value: `${input.dateText}${input.timeText === '' ? '' : ` ${input.timeText}`}`, strong: true },
    { label: '地点', value: input.place === '' ? '（还没定）' : input.place, strong: true },
    { label: '事由', value: input.activity === '' ? '（去了就知道）' : input.activity, strong: false },
    { label: '邀请', value: input.hostName, strong: false },
  ];

  let y = 520;
  const labelX = 172;
  const valueX = 288;
  const valueMax = W - valueX - 172;

  for (const row of rows) {
    ctx.textAlign = 'left';

    ctx.fillStyle = p.inkSoft;
    ctx.font = labelFont;
    ctx.fillText(row.label, labelX, y + 6);

    ctx.fillStyle = row.strong ? p.accent : p.ink;
    ctx.font = row.strong ? valueFont : `32px "PingFang SC", "Microsoft YaHei", sans-serif`;
    const lines = wrap(ctx, row.value, valueMax);
    lines.forEach((line, i) => ctx.fillText(line, valueX, y + i * 54));

    y += Math.max(78, lines.length * 54 + 26);

    // 行与行之间一条很淡的虚线
    ctx.strokeStyle = p.edge;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(labelX, y - 22);
    ctx.lineTo(W - 172, y - 22);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ---------- 倒计时（如果还没到） ----------
  if (input.days > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = p.accent;
    ctx.font = `600 56px "Songti SC", "STSong", "SimSun", serif`;
    ctx.fillText(`距见面还有 ${input.days} 天`, W / 2, y + 64);
    y += 104;
  }

  // ---------- 正文（如果有） ----------
  if (input.body.trim() !== '') {
    ctx.textAlign = 'center';
    ctx.fillStyle = p.inkSoft;
    ctx.font = `30px "Songti SC", "STSong", "SimSun", serif`;
    const bodyLines = wrap(ctx, input.body.trim(), W - 400).slice(0, 5);
    bodyLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, y + 34 + i * 46);
    });
    y += bodyLines.length * 46 + 34;
  }

  // ---------- 落款 ----------
  ctx.textAlign = 'center';
  ctx.fillStyle = p.inkSoft;
  ctx.font = smallFont;
  ctx.fillText('届时恭候，不见不散', W / 2, H - 232);

  ctx.fillStyle = p.ink;
  ctx.font = `600 40px "Songti SC", "STSong", "SimSun", serif`;
  drawTracked(ctx, `${input.hostName} 敬邀`, W / 2, H - 162, 3);

  // 底下一行小字：这是从哪来的
  ctx.fillStyle = p.inkSoft;
  ctx.globalAlpha = 0.6;
  ctx.font = `22px "PingFang SC", "Microsoft YaHei", sans-serif`;
  drawTracked(ctx, '非工作时间约会审批系统', W / 2, H - 96, 4);
  ctx.globalAlpha = 1;

  return canvas;
}
