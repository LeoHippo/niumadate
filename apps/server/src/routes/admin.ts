import type { FastifyInstance } from 'fastify';
import { DEFAULT_CONFIG, apiError, invitePresetFor, isRoleKey } from '@niumadate/shared';
import type { SubmissionStatus } from '@niumadate/shared';
import { bearerOf, issueToken, verifyToken } from '../auth';
import { LOGIN_RULE, allow } from '../rate-limit';
import type { AppConfig } from '../config';
import { getConfig, saveConfig } from '../settings';
import {
  countSubmissions,
  deleteSubmission,
  getSubmission,
  listSubmissions,
  updateSubmission,
} from '../submissions';
import {
  addMessage,
  createInvite,
  deleteInvite,
  getInviteById,
  listInvites,
  listMessages,
  updateInvite,
} from '../invites';

const STATUSES: readonly SubmissionStatus[] = ['pending', 'accepted', 'cancelled'];

/** 一条留言最多这么长。够说清楚「几点到、带不带伞」，又不至于刷屏。 */
export const MAX_INVITE_MESSAGE = 800;

/**
 * 校验邀请的请求体。
 *
 * 返回字符串 = 出错（字符串就是给用户看的原因）；返回对象 = 通过。
 * 文案字段缺了就退回该身份的预设 —— 所以后台只改一两个字段也能存。
 */
function parseInviteBody(
  raw: Record<string, unknown>,
  full: boolean,
): import('@niumadate/shared').CreateInviteInput | Partial<import('@niumadate/shared').CreateInviteInput> | string {
  const out: Record<string, unknown> = {};
  const str = (key: string, max: number): void => {
    const value = raw[key];
    if (value === undefined) return;
    if (typeof value !== 'string') throw new Error(`${key} 应该是文字`);
    out[key] = value.slice(0, max);
  };

  try {
    if (raw.role !== undefined) {
      if (!isRoleKey(raw.role)) throw new Error('身份不对');
      out.role = raw.role;
      // 换了身份就把没改过的文案换成新身份的预设，省得后台手动重填一遍
      const preset = invitePresetFor(raw.role);
      out.title ??= preset.title;
      out.greeting ??= preset.greeting;
      out.body ??= preset.body;
      out.signature ??= preset.signature;
    }
    if (full && raw.role === undefined) throw new Error('得先选一个身份');

    str('inviteeName', 40);
    str('timeText', 40);
    str('place', 120);
    str('activity', 200);
    str('title', 60);
    str('greeting', 120);
    str('body', 1200);
    str('signature', 60);

    if (raw.date !== undefined) {
      if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
        throw new Error('日期格式应该是 2026-09-20 这样');
      }
      out.date = raw.date;
    }
    if (full && out.date === undefined) throw new Error('日期得填');

    if (raw.noDecline !== undefined) {
      if (typeof raw.noDecline !== 'boolean') throw new Error('noDecline 应该是真假值');
      out.noDecline = raw.noDecline;
    }
  } catch (cause) {
    return cause instanceof Error ? cause.message : '参数不对';
  }

  return out as Partial<import('@niumadate/shared').CreateInviteInput>;
}

function isStatus(value: unknown): value is SubmissionStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** 后台接口：登录 + 审批 + 配置。 */
export function registerAdminRoutes(app: FastifyInstance, config: AppConfig): void {
  // 登录本身当然不能要求已登录
  app.post('/admin/login', async (request, reply) => {
    // 口令是唯一的防线，挡一下暴力猜
    if (!allow(`login:${request.ip}`, LOGIN_RULE)) {
      request.log.warn({ ip: request.ip }, '后台登录尝试过于频繁，已限流');
      reply.code(429);
      return apiError('RATE_LIMITED', '尝试太频繁了，等十分钟再试。');
    }

    const body = (request.body ?? {}) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';
    if (password !== config.adminPassword) {
      request.log.warn({ ip: request.ip, passwordLength: password.length }, '后台登录失败：口令不对');
      reply.code(401);
      return apiError('BAD_PASSWORD', '口令不对');
    }
    request.log.info({ ip: request.ip }, '后台登录成功');
    return { token: issueToken(config.sessionSecret) };
  });

  app.register(
    async (admin) => {
      admin.addHook('preHandler', async (request, reply) => {
        if (!verifyToken(bearerOf(request.headers.authorization), config.sessionSecret)) {
          request.log.warn({ ip: request.ip, url: request.url }, '后台接口未授权访问');
          await reply.code(401).send(apiError('UNAUTHORIZED', '登录已过期，请重新登录'));
        }
      });

      admin.get('/config', async () => getConfig());

      admin.put('/config', async (request, reply) => {
        const body = request.body;
        if (typeof body !== 'object' || body === null) {
          request.log.warn({ ip: request.ip }, '后台提交了非法配置：不是一个对象');
          reply.code(400);
          return apiError('BAD_CONFIG', '配置必须是一个对象');
        }

        const result = saveConfig(body);

        if (result.changes.length === 0) {
          request.log.info({ ip: request.ip }, '后台保存了配置，但没有任何字段变化');
        } else {
          // 这一行就是当初该有却没有的东西：谁、从哪、把哪些字段改成了什么
          request.log.info(
            { ip: request.ip, count: result.changes.length, changes: result.changes },
            `后台更新了配置（${result.changes.length} 处变更）`,
          );
        }

        return result.config;
      });

      /**
       * 总开关：只改 site.open。
       *
       * 单独开一个接口，是因为它要放在后台最显眼的位置随手点，
       * 不能顺手把「系统配置」页里还没保存的改动一起覆盖掉。
       */
      admin.put<{ Body: { open?: unknown } }>('/site', async (request, reply) => {
        const { open } = request.body ?? {};

        if (typeof open !== 'boolean') {
          reply.code(400);
          return apiError('BAD_OPEN', 'open 必须是 true 或 false');
        }

        const current = getConfig();
        const saved = saveConfig({ ...current, site: { ...current.site, open } });

        request.log.warn(
          { ip: request.ip, open },
          open ? '总开关：恢复接单' : '总开关：暂停营业',
        );

        return saved.config;
      });

      admin.get<{ Querystring: { role?: string; status?: string } }>('/submissions', async (request) => {
        const items = listSubmissions({ role: request.query.role, status: request.query.status });
        return { items, total: items.length };
      });

      admin.get('/submissions/export', async () => ({
        exportedAt: new Date().toISOString(),
        total: countSubmissions(),
        config: getConfig(),
        items: listSubmissions(),
      }));

      admin.get<{ Params: { id: string } }>('/submissions/:id', async (request, reply) => {
        const found = getSubmission(request.params.id);
        if (found === undefined) {
          reply.code(404);
          return apiError('NOT_FOUND', '这条记录不存在');
        }
        return found;
      });

      /** 一键恢复出厂默认。 */
      admin.post('/config/reset', async (request) => {
        const result = saveConfig(DEFAULT_CONFIG);
        request.log.warn(
          { ip: request.ip, count: result.changes.length },
          `把配置恢复成了出厂默认（${result.changes.length} 处变化）`,
        );
        return result.config;
      });

      /** 批量批准 / 驳回 / 删除。 */
      admin.post<{ Body: { ids?: unknown; action?: unknown } }>(
        '/submissions/batch',
        async (request, reply) => {
          const { ids, action } = request.body ?? {};

          if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
            request.log.warn({ ip: request.ip }, '批量操作没给 ids');
            reply.code(400);
            return apiError('BAD_IDS', '要传一个非空的 id 数组');
          }
          const picked = ids as string[];

          if (action === 'delete') {
            const affected = picked.filter((id) => deleteSubmission(id)).length;
            request.log.warn({ ip: request.ip, count: affected }, `批量删除了 ${affected} 条申请`);
            return { ok: true, affected };
          }

          if (!isStatus(action)) {
            reply.code(400);
            return apiError('BAD_ACTION', 'action 只能是 pending / accepted / cancelled / delete');
          }

          const affected = picked.filter((id) => updateSubmission(id, { status: action }) !== undefined).length;
          request.log.info(
            { ip: request.ip, status: action, count: affected },
            `批量把 ${affected} 条改成 ${action}`,
          );
          return { ok: true, affected };
        },
      );

      admin.patch<{
        Params: { id: string };
        Body: { status?: unknown; adminNote?: unknown; place?: unknown };
      }>('/submissions/:id', async (request, reply) => {
        const { status, adminNote, place } = request.body ?? {};

        if (status !== undefined && !isStatus(status)) {
          reply.code(400);
          return apiError('BAD_STATUS', '状态只能是 pending / accepted / cancelled');
        }
        if (adminNote !== undefined && typeof adminNote !== 'string') {
          reply.code(400);
          return apiError('BAD_NOTE', '备注必须是字符串');
        }
        if (place !== undefined && place !== null && typeof place !== 'string') {
          reply.code(400);
          return apiError('BAD_PLACE', '地点必须是字符串或 null');
        }

        const updated = updateSubmission(request.params.id, {
          status: status === undefined ? undefined : status,
          adminNote: adminNote === undefined ? undefined : adminNote.slice(0, 500),
          place: place === undefined ? undefined : place === null ? null : place.slice(0, 200),
        });
        if (updated === undefined) {
          reply.code(404);
          return apiError('NOT_FOUND', '这条记录不存在');
        }
        return updated;
      });

      admin.delete<{ Params: { id: string } }>('/submissions/:id', async (request, reply) => {
        if (!deleteSubmission(request.params.id)) {
          reply.code(404);
          return apiError('NOT_FOUND', '这条记录不存在');
        }
        return { ok: true };
      });

      // ---------- 邀请 ----------

      admin.get('/invites', async () => ({ items: listInvites() }));

      admin.post<{ Body: Record<string, unknown> }>('/invites', async (request, reply) => {
        const parsed = parseInviteBody(request.body ?? {}, true);
        if (typeof parsed === 'string') {
          reply.code(400);
          return apiError('BAD_REQUEST', parsed);
        }
        const created = createInvite(parsed as import('@niumadate/shared').CreateInviteInput);
        request.log.info({ ip: request.ip, code: created.code }, '创建了一条邀请');
        return { invite: created };
      });

      admin.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
        '/invites/:id',
        async (request, reply) => {
          const parsed = parseInviteBody(request.body ?? {}, false);
          if (typeof parsed === 'string') {
            reply.code(400);
            return apiError('BAD_REQUEST', parsed);
          }
          const updated = updateInvite(request.params.id, parsed);
          if (updated === null) {
            reply.code(404);
            return apiError('NOT_FOUND', '这条邀请不存在');
          }
          return { invite: updated };
        },
      );

      admin.delete<{ Params: { id: string } }>('/invites/:id', async (request, reply) => {
        if (!deleteInvite(request.params.id)) {
          reply.code(404);
          return apiError('NOT_FOUND', '这条邀请不存在');
        }
        request.log.info({ ip: request.ip, id: request.params.id }, '删掉了一条邀请');
        return { ok: true };
      });

      /** 取某条邀请的全部留言。后台的对话区用。 */
      admin.get<{ Params: { id: string } }>('/invites/:id/messages', async (request, reply) => {
        const invite = getInviteById(request.params.id);
        if (invite === null) {
          reply.code(404);
          return apiError('NOT_FOUND', '这条邀请不存在');
        }
        return { messages: listMessages(invite.id) };
      });

      /** 后台留言：以「牛马」的身份发。 */
      admin.post<{ Params: { id: string }; Body: { text?: unknown } }>(
        '/invites/:id/messages',
        async (request, reply) => {
          const invite = getInviteById(request.params.id);
          if (invite === null) {
            reply.code(404);
            return apiError('NOT_FOUND', '这条邀请不存在');
          }
          const body = (request.body ?? {}) as { text?: unknown };
          const text =
            typeof body.text === 'string' ? body.text.trim().slice(0, MAX_INVITE_MESSAGE) : '';
          if (text === '') {
            reply.code(400);
            return apiError('BAD_REQUEST', '留言不能是空的');
          }
          return { messages: [...listMessages(invite.id), addMessage(invite.id, 'host', text)] };
        },
      );
    },
    { prefix: '/admin' },
  );
}
