import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** 业务层只依赖这个最小接口，不关心底下是 pino 还是控制台。 */
export interface Logger {
  info(fields: Record<string, unknown>, message?: string): void;
  warn(fields: Record<string, unknown>, message?: string): void;
  error(fields: Record<string, unknown>, message?: string): void;
  debug(fields: Record<string, unknown>, message?: string): void;
}

/**
 * 兜底日志：在 Fastify 起来之前（或者单元测试里）用它，
 * 保证任何一行日志都不会因为「还没初始化」而丢掉。
 */
const fallback: Logger = {
  info: (fields, message) => console.log(JSON.stringify({ level: 'info', ...fields, msg: message })),
  warn: (fields, message) => console.warn(JSON.stringify({ level: 'warn', ...fields, msg: message })),
  error: (fields, message) => console.error(JSON.stringify({ level: 'error', ...fields, msg: message })),
  debug: () => {},
};

let current: Logger = fallback;

/** 启动时调用一次，把 Fastify 的 logger 接进来。 */
export function setLogger(logger: Logger): void {
  current = logger;
}

/** 取当前 logger。业务模块用它写日志。 */
export function log(): Logger {
  return current;
}

/** pino 只要求有 write 方法。 */
export interface LogStream {
  write(chunk: string): void;
}

/**
 * 日志同时进标准输出和（可选的）文件。
 *
 * 为什么要落文件：线上用 journalctl 能看，但排查历史问题时
 * 翻一个固定的文件比在几十万行 journal 里翻要省事得多。
 * 这里刻意用同步写，进程崩了也不会丢掉最后几行。
 */
/** 单个日志文件的上限，超了就轮转。 */
const LOG_MAX_MB = Number(process.env.LOG_FILE_MAX_MB ?? 5);

export function createLogStream(logFile: string | null): LogStream {
  if (logFile === null) return process.stdout;

  const target = resolve(logFile);
  mkdirSync(dirname(target), { recursive: true });

  let size = 0;
  try {
    size = statSync(target).size;
  } catch {
    size = 0;
  }

  const maxBytes = (Number.isFinite(LOG_MAX_MB) && LOG_MAX_MB > 0 ? LOG_MAX_MB : 5) * 1024 * 1024;

  return {
    write(chunk: string) {
      process.stdout.write(chunk);
      try {
        size += Buffer.byteLength(chunk, 'utf8');

        // 超过上限就把旧的挪成 .1（只留一代），重新开一个。
        // 线上一跑几个月，不轮转会一直涨到把磁盘写满。
        if (size > maxBytes) {
          try {
            renameSync(target, `${target}.1`);
          } catch {
            // 首次写入时旧文件可能不存在，忽略
          }
          size = 0;
        }

        appendFileSync(target, chunk, 'utf8');
      } catch {
        // 日志文件写不进去也不能把业务搞挂
      }
    },
  };
}

/** 把任意异常压成一行，方便塞进日志字段。 */
export function errText(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return String(cause);
}
