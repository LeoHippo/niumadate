import type { RoleKey } from './types';

/**
 * 邀请：牛马在后台创建，生成一条链接发给好友。
 *
 * 它和「申请」是两条独立的线：
 *   申请   —— 好友发起，牛马审批，单向
 *   邀请   —— 牛马发起，好友接受或婉拒，**之后两边能来回留言**
 *
 * 最后那条是重点。它不是一张看完就扔的请柬，而是**一个约会协调器**：
 * 定下来之后还要商量「几点到」「要不要带伞」「我想吃那家」。
 */

export type InviteStatus = 'pending' | 'accepted' | 'declined';

/** 留言是谁说的。host = 牛马（后台），guest = 好友。 */
export type InviteSpeaker = 'host' | 'guest';

export interface Invite {
  id: string;
  /** 链接里那串码：`/i/<code>`。够长、猜不到。 */
  code: string;
  role: RoleKey;
  /** 邀请谁。空字符串 = 通用链接，谁点都能看。 */
  inviteeName: string;
  /** 约会日期 yyyy-MM-dd。用日期选择器填，所以能排序、能判断过期。 */
  date: string;
  /** 时间是自由文字，如「晚上七点半」—— 邀请往往不是整时段。 */
  timeText: string;
  place: string;
  activity: string;
  title: string;
  /** 开场白，支持 `{name}` 占位符。 */
  greeting: string;
  /** 正文，可以多行。 */
  body: string;
  signature: string;
  /**
   * 不允许拒绝。
   *
   * 勾上之后婉拒按钮**还在，但点不到** —— 一个小人会从屏幕右边走过来，
   * 一把抓起婉拒按钮、团成团扔出去，再把接受按钮用力拉大，
   * 坐在上面、双腿耷拉下来，指着「同意」。
   */
  noDecline: boolean;
  status: InviteStatus;
  /** 好友什么时候回应的。没回应就是 null。 */
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InviteMessage {
  id: string;
  inviteId: string;
  from: InviteSpeaker;
  text: string;
  createdAt: string;
}

/** 邀请里那四段可以改的文案。 */
export interface InviteCopy {
  title: string;
  greeting: string;
  body: string;
  signature: string;
}

/** 创建邀请时前端要交上来的东西（不含 id / code / 状态）。 */
export interface CreateInviteInput extends InviteCopy {
  role: RoleKey;
  inviteeName: string;
  date: string;
  timeText: string;
  place: string;
  activity: string;
  noDecline: boolean;
}

/**
 * 四个身份各一套**已经确认好的默认文案**。
 *
 * 后台创建邀请时按身份一键套用，之后每个字都能改 ——
 * 用后台的人熟悉这套系统，自由度给够。
 * 但默认值必须是能直接发出去的：改都不改就发，也不丢人。
 */
export const INVITE_PRESETS: Record<RoleKey, InviteCopy> = {
  // 好兄弟：直、糙、讲义气，不整虚的
  brother: {
    title: '出来整点',
    greeting: '{name}，兄弟。',
    body: '别问干啥，来了就知道。\n反正不是加班。',
    signature: '—— 你兄弟',
  },

  // 好姐妹：精致、要拍照、要修图
  sister: {
    title: '出来逛逛？',
    greeting: '{name} 呀，',
    body: '最近累坏了吧，出来透透气。\n顺便帮我拍两张，我新买了衣服。',
    signature: '—— 等你哦',
  },

  // 好宝宝：亲昵但不腻，不用叠字堆
  baby: {
    title: '想见你',
    greeting: '{name}，',
    body: '好久没见到你了，想跟你待一会儿。\n不用准备什么，人来就行。',
    signature: '—— 宝宝',
  },

  // DAD&MUM：正经公文腔，但内容是家事
  dadmam: {
    title: '家庭活动通知',
    greeting: '{name} 同志：',
    body: '经家庭会议研究决定，现将本次活动安排通知如下。\n请合理安排时间，准时出席，不得无故缺席。',
    signature: '父字',
  },
};

/** 取某个身份的默认邀请文案。 */
export function invitePresetFor(role: RoleKey): InviteCopy {
  return INVITE_PRESETS[role];
}

/** 文案里支持 `{name}` 占位符；没填名字就退回一个通用称呼。 */
export function fillInviteName(template: string, name: string): string {
  return template.replaceAll('{name}', name.trim() === '' ? '朋友' : name.trim());
}

/** 码表：去掉了容易看错的 0 O 1 I l，方便口头/手抄。 */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * 生成邀请码。
 *
 * 22 位、字母表 31 个字符 → 约 108 bit，猜不到（这是唯一的访问凭据，
 * 相当于一个不需要登录的链接密码）。用 crypto 的随机数，不用 Math.random。
 */
export function makeInviteCode(random: (size: number) => Uint8Array): string {
  const bytes = random(22);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export const INVITE_CODE_PATTERN = /^[a-z0-9]{16,64}$/;
