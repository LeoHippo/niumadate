import type { RoleKey } from '@niumadate/shared';

/**
 * 四个身份各自压在火漆上的图案。
 *
 * 这件事的意义在于：好友点开链接、看到信封的那一秒钟，
 * 他就应该认出"这是写给我的" —— 不是靠文字，是靠那个图案。
 * 所以实验室和线上必须**用同一份**，改一处两处都变。
 */
export const ROLE_EMOJI: Record<RoleKey, string> = {
  brother: '🍻',
  sister: '💅',
  baby: '🥰',
  dadmam: '🏠',
};

/** 实验室里显示的中文名 */
export const ROLE_LABEL: Record<RoleKey, string> = {
  brother: '好兄弟',
  sister: '好姐妹',
  baby: '好宝宝',
  dadmam: 'DAD 和 MUM',
};
