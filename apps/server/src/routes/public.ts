import type { FastifyInstance } from 'fastify';
import { apiError, buildDayRows, findRole, isRoleKey } from '@niumadate/shared';
import type { CustomTime, SlotSelection } from '@niumadate/shared';
import { SUBMIT_RULE, allow } from '../rate-limit';
import { createSubmission, findLatestByDevice } from '../submissions';
import { getConfig } from '../settings';

const MAX_NAME = 20;
const MAX_MESSAGE = 500;
const MAX_PLACE = 200;
const MAX_CUSTOM_TEXT = 60;
const MAX_MEETING = 60;

/** 好友端用到的公开接口。 */
export function registerPublicRoutes(app: FastifyInstance): void {
  /** 入口页和填写页都靠它渲染；配置改了立即生效。 */
  app.get('/config', async () => getConfig());

  /** 同一台设备再次进入时查自己的状态。 */
  app.get<{ Querystring: { deviceId?: string; role?: string } }>(
    '/submissions/me',
    async (request, reply) => {
      const { deviceId, role } = request.query;
      if (deviceId === undefined || deviceId === '' || role === undefined || role === '') {
        request.log.warn({ query: request.query }, '查询自己的申请时缺少参数');
        reply.code(400);
        return apiError('BAD_REQUEST', '缺少 deviceId 或 role');
      }
      return { submission: findLatestByDevice(deviceId, role) ?? null };
    },
  );

  app.post('/submissions', async (request, reply) => {
    const config = getConfig();
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (!config.site.open) {
      request.log.warn({ ip: request.ip }, '站点已暂停营业，拒绝了提交');
      reply.code(403);
      return apiError('SITE_CLOSED', config.copies.siteClosed);
    }

    /**
     * 提交被拒时统一走这里。
     *
     * 光看 Fastify 的 400 只知道「被拒了」，不知道「为什么」——
     * 前后端一旦对不上（比如时段可选性判断不一致），这里就是第一现场。
     */
    const reject = (status: number, code: string, message: string) => {
      request.log.warn(
        {
          status,
          code,
          ip: request.ip,
          role: body.role,
          name: body.name,
          slots: body.slots,
          customTimes: body.customTimes,
          place: body.place,
        },
        `提交被拒：${message}`,
      );
      reply.code(status);
      return apiError(code, message);
    };

    // 公开链接，挡一下爬虫和手滑连点
    if (!allow(`submit:${request.ip}`, SUBMIT_RULE)) {
      return reject(429, 'RATE_LIMITED', '提交得太频繁了，歇一会儿再试。');
    }

    if (!isRoleKey(body.role)) {
      return reject(400, 'BAD_ROLE', '身份不合法');
    }
    const role = findRole(config, body.role);
    if (role === undefined || !role.enabled) {
      return reject(403, 'ROLE_CLOSED', role?.closedText ?? '这个身份没有开放');
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0 || name.length > MAX_NAME) {
      return reject(400, 'BAD_NAME', `昵称必填，且不超过 ${MAX_NAME} 个字`);
    }

    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (deviceId.length === 0 || deviceId.length > 100) {
      return reject(400, 'BAD_DEVICE', '设备号不合法');
    }

    // 用与前端完全相同的网格逻辑反推合法性，避免绕过前端直接打接口
    const rows = buildDayRows(config);
    const validDates = new Set(rows.map((row) => row.date));
    const blockedKeys = new Set(
      rows.flatMap((row) =>
        row.cells.filter((cell) => !cell.selectable).map((cell) => `${cell.date}|${cell.slot}`),
      ),
    );

    const slots: SlotSelection[] = [];
    const seen = new Set<string>();
    if (body.slots !== undefined) {
      if (!Array.isArray(body.slots)) {
        return reject(400, 'BAD_SLOTS', 'slots 必须是数组');
      }
      for (const item of body.slots) {
        const candidate = (item ?? {}) as { date?: unknown; slot?: unknown };
        const date = typeof candidate.date === 'string' ? candidate.date : '';
        const slotKey = typeof candidate.slot === 'string' ? candidate.slot : '';
        if (!validDates.has(date)) {
          return reject(400, 'BAD_DATE', '所选日期不在可选范围内');
        }
        if (!config.slots.some((slot) => slot.key === slotKey)) {
          return reject(400, 'BAD_SLOT', '时段不存在');
        }
        if (blockedKeys.has(`${date}|${slotKey}`)) {
          return reject(400, 'LOCKED_SLOT', `${date} 的 ${slotKey} 不可选`);
        }
        const key = `${date}|${slotKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push({ date, slot: slotKey });
      }
    }

    const customTimes: CustomTime[] = [];
    if (body.customTimes !== undefined) {
      if (!Array.isArray(body.customTimes)) {
        return reject(400, 'BAD_CUSTOM_TIMES', 'customTimes 必须是数组');
      }
      if (!config.allowCustomTime) {
        return reject(400, 'CUSTOM_TIME_CLOSED', '当前不允许自己加时间');
      }
      for (const item of body.customTimes) {
        const candidate = (item ?? {}) as { date?: unknown; text?: unknown };
        const date = typeof candidate.date === 'string' ? candidate.date : '';
        const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
        if (!validDates.has(date) || text.length === 0 || text.length > MAX_CUSTOM_TEXT) {
          return reject(400, 'BAD_CUSTOM_TIME', '自定义时间不合法');
        }
        customTimes.push({ date, text });
      }
    }

    if (slots.length === 0 && customTimes.length === 0) {
      return reject(400, 'EMPTY_SELECTION', '至少选一个时间，或者自己加一条');
    }
    if (!config.allowMultipleSlots && slots.length + customTimes.length > 1) {
      return reject(400, 'TOO_MANY_SELECTIONS', '当前一次只能选一个时间');
    }

    let place: string | null;
    if (body.place === null) {
      if (!config.place.allowLetYouDecide) {
        return reject(400, 'PLACE_REQUIRED', '必须填写地点');
      }
      place = null;
    } else if (typeof body.place === 'string' && body.place.trim().length > 0) {
      const trimmed = body.place.trim();
      if (trimmed.length > MAX_PLACE) {
        return reject(400, 'BAD_PLACE', `地点不超过 ${MAX_PLACE} 个字`);
      }
      place = trimmed;
    } else {
      return reject(400, 'PLACE_REQUIRED', '填写地点，或者点「让你定」交给后台');
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length > MAX_MESSAGE) {
      return reject(400, 'BAD_MESSAGE', `留言不超过 ${MAX_MESSAGE} 个字`);
    }

    // 见面要求是好友写的，可以空着
    const meetingNote = typeof body.meetingNote === 'string' ? body.meetingNote.trim() : '';
    if (meetingNote.length > MAX_MEETING) {
      return reject(400, 'BAD_MEETING_NOTE', `见面要求不超过 ${MAX_MEETING} 个字`);
    }

    const submission = createSubmission({
      role: body.role,
      name,
      deviceId,
      slots,
      customTimes,
      place,
      message,
      meetingNote,
    });
    reply.code(201);
    return submission;
  });
}
