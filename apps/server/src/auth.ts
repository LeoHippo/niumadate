import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** 登录成功后签发一个 `payload.signature` 形式的 token。 */
export function issueToken(secret: string): string {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** 校验 token：签名正确且没过期。 */
export function verifyToken(token: string | undefined, secret: string): boolean {
  if (token === undefined || token === '') return false;
  const [body, signature] = token.split('.');
  if (body === undefined || signature === undefined) return false;

  const expected = sign(body, secret);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  if (!timingSafeEqual(given, want)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

/** 从 Authorization: Bearer xxx 里取出 token。 */
export function bearerOf(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}
