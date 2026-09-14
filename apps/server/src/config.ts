import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** 运行时配置：全部来自环境变量，带可用默认值。 */
export interface AppConfig {
  host: string;
  port: number;
  /** 允许跨域的 Web 来源。 */
  webOrigin: string;
  /** 数据库与 config.json 的存放目录。 */
  dataDir: string;
  adminPassword: string;
  sessionSecret: string;
  /** 前端构建产物目录；不存在就只提供 API。 */
  webDist: string;
  isProduction: boolean;
  /**
   * 是否信任反向代理传来的 X-Forwarded-For。
   *
   * **挂在 Caddy / Nginx 后面时必须打开**，否则 Fastify 看到的
   * `request.ip` 永远是 127.0.0.1 —— 限流会退化成「全站共用一个桶」，
   * 日志里的来源 IP 也全变成本机。
   */
  trustProxy: boolean;
  logLevel: string;
  /** 设了就额外把日志追加到这个文件（除了标准输出）。 */
  logFile: string | null;
}

/** src/ 和 dist/ 都在 apps/server 下，所以往上退一级就是包根目录。 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PORT = 8787;
/** 这些默认值只用于本地开发，线上必须用环境变量覆盖。 */
const DEV_ADMIN_PASSWORD = 'niuma-dev';
const DEV_SESSION_SECRET = 'niuma-dev-secret';

export const USING_DEV_SECRETS = Symbol('using-dev-secrets');

/** 读取并校验环境变量，非法值直接抛错而不是悄悄兜底。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.PORT;
  const port = rawPort === undefined || rawPort === '' ? DEFAULT_PORT : Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 必须是 1-65535 的整数，当前值：${String(rawPort)}`);
  }

  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    dataDir: env.DATA_DIR !== undefined && env.DATA_DIR !== '' ? resolve(env.DATA_DIR) : resolve(packageRoot, 'data'),
    adminPassword: env.ADMIN_PASSWORD ?? DEV_ADMIN_PASSWORD,
    sessionSecret: env.SESSION_SECRET ?? DEV_SESSION_SECRET,
    // packageRoot 是 apps/server，前端产物在隔壁 apps/web/dist
    webDist: env.WEB_DIST !== undefined && env.WEB_DIST !== '' ? resolve(env.WEB_DIST) : resolve(packageRoot, '../web/dist'),
    isProduction: env.NODE_ENV === 'production',
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    logLevel: env.LOG_LEVEL ?? 'info',
    logFile: env.LOG_FILE !== undefined && env.LOG_FILE !== '' ? resolve(env.LOG_FILE) : null,
  };
}

/** 是否还在用开发默认口令 / 密钥。 */
export function usesDevSecrets(config: AppConfig): boolean {
  return config.adminPassword === DEV_ADMIN_PASSWORD || config.sessionSecret === DEV_SESSION_SECRET;
}
