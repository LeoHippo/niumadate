import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, normalizeConfig } from '@niumadate/shared';
import type { AppConfig } from '@niumadate/shared';
import { errText, log } from './log';

let dataDir = '';

/** 进程启动时调用一次，告诉它 config.json 放哪。 */
export function initSettings(dir: string): void {
  dataDir = dir;
  mkdirSync(dir, { recursive: true });
  getConfig(); // 顺便把默认配置落盘，方便手工改
}

function configFile(): string {
  return join(dataDir, 'config.json');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 对比两份配置，返回人能读懂的变更列表。
 *
 * 这个函数是这次补日志的重点：之前 dateRangeDays 被谁改成 60 完全查不到，
 * 有了它，任何一次配置写入都会在日志里留下逐字段的 diff。
 */
export function diffConfig(before: unknown, after: unknown, path = ''): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];

  if (Array.isArray(before) && Array.isArray(after)) {
    const out: string[] = [];
    const longest = Math.max(before.length, after.length);
    for (let index = 0; index < longest; index += 1) {
      out.push(...diffConfig(before[index], after[index], `${path}[${index}]`));
    }
    return out;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const out: string[] = [];
    for (const key of keys) {
      out.push(...diffConfig(before[key], after[key], path === '' ? key : `${path}.${key}`));
    }
    return out;
  }

  const label = path === '' ? '(root)' : path;
  return [`${label}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`];
}

/** 每次读盘：后台改完立即生效，不需要重启进程。 */
export function getConfig(): AppConfig {
  if (dataDir === '') throw new Error('settings 还没初始化');
  const file = configFile();

  if (!existsSync(file)) {
    writeFileSync(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
    log().info({ file }, '没找到 config.json，已写入出厂配置');
    return DEFAULT_CONFIG;
  }

  const text = readFileSync(file, 'utf8');
  try {
    return normalizeConfig(JSON.parse(text));
  } catch (cause) {
    // 刻意不回写文件：坏掉的配置要原样留着给人看，不能被悄悄覆盖掉
    log().error(
      { file, error: errText(cause) },
      'config.json 解析失败，本次回退到出厂配置（文件未覆盖，请手动检查）',
    );
    return DEFAULT_CONFIG;
  }
}

export interface SaveConfigResult {
  config: AppConfig;
  changes: string[];
}

/** 归一化后落盘，返回真正生效的配置和逐字段变更。 */
export function saveConfig(raw: unknown): SaveConfigResult {
  const before = getConfig();
  const next = normalizeConfig(raw);

  writeFileSync(configFile(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  // 变更明细交给调用方记录：路由层能同时带上来源 IP，一条日志说清「谁改了什么」
  return { config: next, changes: diffConfig(before, next) };
}
