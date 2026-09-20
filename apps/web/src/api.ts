import { API_PREFIX } from '@niumadate/shared';
import { safeStorage } from './lib';
import type {
  AppConfig,
  ApiError,
  CreateInviteInput,
  CreateSubmissionInput,
  Invite,
  InviteMessage,
  Submission,
  SubmissionStatus,
} from '@niumadate/shared';

/** 后端返回了结构化错误，或者响应本身就不是 2xx。 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = 'niumadate.admin.token';

/** 后台 token 存浏览器；用户端完全不需要登录。 */
export const adminToken = {
  // 同样走 safeStorage：手机上 localStorage 会抛异常，
  // 而后台也要能在这种浏览器里打开（大不了每次重新登录）。
  get(): string | null {
    return safeStorage.get(TOKEN_KEY);
  },
  set(value: string | null): void {
    if (value === null) safeStorage.remove(TOKEN_KEY);
    else safeStorage.set(TOKEN_KEY, value);
  },
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.auth === true) {
    const token = adminToken.get();
    if (token !== null) headers.authorization = `Bearer ${token}`;
  }

  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  const response = await fetch(`${API_PREFIX}${path}`, init);

  const text = await response.text();
  let payload: unknown = null;
  if (text !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const failure = payload as Partial<ApiError> | null;
    const code = failure?.error?.code ?? 'HTTP_ERROR';
    // 浏览器控制台里能直接看出是哪个接口、什么码，省得靠猜
    console.warn(`[api] ${options.method ?? 'GET'} ${path} → HTTP ${response.status} ${code}`, failure ?? '');
    throw new ApiRequestError(
      response.status,
      code,
      failure?.error?.message ?? `请求失败：HTTP ${response.status}`,
    );
  }

  return payload as T;
}

export interface AdminListFilter {
  role?: string;
  status?: string;
}

export interface ExportPayload {
  exportedAt: string;
  total: number;
  config: AppConfig;
  items: Submission[];
}

export interface SubmissionPatch {
  status?: SubmissionStatus;
  adminNote?: string;
  place?: string | null;
}

export const api = {
  getConfig: (): Promise<AppConfig> => request<AppConfig>('/config'),

  submit: (input: CreateSubmissionInput): Promise<Submission> =>
    request<Submission>('/submissions', { method: 'POST', body: input }),

  mySubmission: (deviceId: string, role: string): Promise<{ submission: Submission | null }> =>
    request<{ submission: Submission | null }>(
      `/submissions/me?deviceId=${encodeURIComponent(deviceId)}&role=${encodeURIComponent(role)}`,
    ),

  // ---------- 邀请（好友那一侧，不需要登录）----------

  /**
   * 按码取邀请 + 全部留言。
   *
   * 码本身就是访问凭据 —— 没有登录、没有口令，拿到码就能看，
   * 所以服务端把码做得够长（22 位），并且这条读取单独限流。
   */
  invite: (code: string): Promise<{ invite: Invite; messages: InviteMessage[] }> =>
    request<{ invite: Invite; messages: InviteMessage[] }>(
      `/invites/${encodeURIComponent(code)}`,
    ),

  /** 接受或婉拒。**允许改** —— 现实里会变卦。 */
  respondInvite: (
    code: string,
    status: 'accepted' | 'declined',
  ): Promise<{ invite: Invite }> =>
    request<{ invite: Invite }>(`/invites/${encodeURIComponent(code)}/respond`, {
      method: 'POST',
      body: { status },
    }),

  /** 好友留言。「谁说的」由服务端定死，客户端说了不算。 */
  sendInviteMessage: (code: string, text: string): Promise<{ messages: InviteMessage[] }> =>
    request<{ messages: InviteMessage[] }>(
      `/invites/${encodeURIComponent(code)}/messages`,
      { method: 'POST', body: { text } },
    ),

  admin: {
    login: (password: string): Promise<{ token: string }> =>
      request<{ token: string }>('/admin/login', { method: 'POST', body: { password } }),

    getConfig: (): Promise<AppConfig> => request<AppConfig>('/admin/config', { auth: true }),

    saveConfig: (config: AppConfig): Promise<AppConfig> =>
      request<AppConfig>('/admin/config', { method: 'PUT', body: config, auth: true }),

    /** 一键恢复出厂默认配置。 */
    resetConfig: (): Promise<AppConfig> =>
      request<AppConfig>('/admin/config/reset', { method: 'POST', auth: true }),

    /** 总开关：只动 site.open，不影响配置页里没保存的改动。 */
    setSiteOpen: (open: boolean): Promise<AppConfig> =>
      request<AppConfig>('/admin/site', { method: 'PUT', body: { open }, auth: true }),

    list: (filter: AdminListFilter = {}): Promise<{ items: Submission[]; total: number }> => {
      const params = new URLSearchParams();
      if (filter.role !== undefined && filter.role !== '') params.set('role', filter.role);
      if (filter.status !== undefined && filter.status !== '') params.set('status', filter.status);
      const query = params.toString();
      return request<{ items: Submission[]; total: number }>(
        `/admin/submissions${query === '' ? '' : `?${query}`}`,
        { auth: true },
      );
    },

    get: (id: string): Promise<Submission> =>
      request<Submission>(`/admin/submissions/${encodeURIComponent(id)}`, { auth: true }),

    patch: (id: string, patch: SubmissionPatch): Promise<Submission> =>
      request<Submission>(`/admin/submissions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
        auth: true,
      }),

    /** 批量批准 / 驳回 / 删除。 */
    batch: (
      ids: string[],
      action: SubmissionStatus | 'delete',
    ): Promise<{ ok: boolean; affected: number }> =>
      request<{ ok: boolean; affected: number }>('/admin/submissions/batch', {
        method: 'POST',
        body: { ids, action },
        auth: true,
      }),

    remove: (id: string): Promise<{ ok: boolean }> =>
      request<{ ok: boolean }>(`/admin/submissions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        auth: true,
      }),

    exportAll: (): Promise<ExportPayload> =>
      request<ExportPayload>('/admin/submissions/export', { auth: true }),

    // ---------- 邀请 ----------

    listInvites: (): Promise<{ items: Invite[] }> =>
      request<{ items: Invite[] }>('/admin/invites', { auth: true }),

    createInvite: (input: CreateInviteInput): Promise<{ invite: Invite }> =>
      request<{ invite: Invite }>('/admin/invites', { method: 'POST', body: input, auth: true }),

    updateInvite: (id: string, patch: Partial<CreateInviteInput>): Promise<{ invite: Invite }> =>
      request<{ invite: Invite }>(`/admin/invites/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
        auth: true,
      }),

    removeInvite: (id: string): Promise<{ ok: boolean }> =>
      request<{ ok: boolean }>(`/admin/invites/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        auth: true,
      }),

    inviteMessages: (id: string): Promise<{ messages: InviteMessage[] }> =>
      request<{ messages: InviteMessage[] }>(
        `/admin/invites/${encodeURIComponent(id)}/messages`,
        { auth: true },
      ),

    /** 后台以「牛马」的身份回一句。 */
    sendInviteMessage: (id: string, text: string): Promise<{ messages: InviteMessage[] }> =>
      request<{ messages: InviteMessage[] }>(
        `/admin/invites/${encodeURIComponent(id)}/messages`,
        { method: 'POST', body: { text }, auth: true },
      ),
  },
};

/** 页面里统一用它把异常转成人能看的一句话。 */
export function describeError(cause: unknown): string {
  if (cause instanceof ApiRequestError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
