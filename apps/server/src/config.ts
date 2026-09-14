import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  /**
   * 这两个是不是**本次启动才生成的**。
   * 生成时要在日志里明明白白打一次，否则主人根本不知道口令是什么。
   */
  generatedAdminPassword: boolean;
  generatedSessionSecret: boolean;
  /** 口令来源：env（环境变量）/ file（data 目录里存着）/ generated（刚生成）。 */
  adminPasswordSource: SecretSource;
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

export type SecretSource = 'env' | 'file' | 'generated';

/** src/ 和 dist/ 都在 apps/server 下，所以往上退一级就是包根目录。 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PORT = 8787;

/**
 * 生成一个好念、好抄的口令。
 *
 * 字母表**故意不含 0 O 1 I l** —— 抄口令时最容易错的就是这几个，
 * 而口令只会在日志里出现一次，抄错一次就得重来。
 * 3 组 × 4 位，共 12 位、约 60 bit，配上登录限流足够用。
 */
function generateSecret(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chunk = (): string =>
    Array.from(randomBytes(4), (byte) => alphabet[byte % alphabet.length]).join('');
  return `${chunk()}-${chunk()}-${chunk()}`;
}

/**
 * 取一个密钥：环境变量 → data 目录里的文件 → 现场生成并落盘。
 *
 * **绝对不要给默认值。** 这个仓库是公开的，任何写死的默认口令和默认签名密钥
 * 都等于公开：口令能直接登进来，密钥更糟 —— 知道密钥的人可以自己签一个
 * 合法 token，连口令都不用猜。所以「没配」的后果只能是随机生成，不能是兜底。
 */
function loadSecret(
  env: NodeJS.ProcessEnv,
  envKey: string,
  dataDir: string,
  fileName: string,
): { value: string; source: SecretSource } {
  const fromEnv = env[envKey];
  if (fromEnv !== undefined && fromEnv !== '') return { value: fromEnv, source: 'env' };

  const filePath = join(dataDir, fileName);
  if (existsSync(filePath)) {
    const stored = readFileSync(filePath, 'utf8').trim();
    if (stored !== '') return { value: stored, source: 'file' };
  }

  const value = generateSecret();
  mkdirSync(dataDir, { recursive: true });
  // mode 0o600：只有属主能读。Windows 上会被忽略，不影响。
  writeFileSync(filePath, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  return { value, source: 'generated' };
}

/** 读取并校验环境变量，非法值直接抛错而不是悄悄兜底。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.PORT;
  const port = rawPort === undefined || rawPort === '' ? DEFAULT_PORT : Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT 必须是 1-65535 的整数，当前值：${String(rawPort)}`);
  }

  const dataDir =
    env.DATA_DIR !== undefined && env.DATA_DIR !== '' ? resolve(env.DATA_DIR) : resolve(packageRoot, 'data');

  const admin = loadSecret(env, 'ADMIN_PASSWORD', dataDir, 'admin-password');
  const session = loadSecret(env, 'SESSION_SECRET', dataDir, 'session-secret');

  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    dataDir,
    adminPassword: admin.value,
    sessionSecret: session.value,
    generatedAdminPassword: admin.source === 'generated',
    generatedSessionSecret: session.source === 'generated',
    adminPasswordSource: admin.source,
    // packageRoot 是 apps/server，前端产物在隔壁 apps/web/dist
    webDist:
      env.WEB_DIST !== undefined && env.WEB_DIST !== ''
        ? resolve(env.WEB_DIST)
        : resolve(packageRoot, '../web/dist'),
    isProduction: env.NODE_ENV === 'production',
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    logLevel: env.LOG_LEVEL ?? 'info',
    logFile: env.LOG_FILE !== undefined && env.LOG_FILE !== '' ? resolve(env.LOG_FILE) : null,
  };
}
