/**
 * 极简内存限流。
 *
 * 目的不是防黑客，是**别让公开链接被爬**或者被人手滑刷出一堆垃圾提交。
 * 进程重启就清空 —— 这个规模的应用不需要更复杂的东西。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 超过这个条数就顺手清一次过期桶，避免 Map 无限长。 */
const SWEEP_THRESHOLD = 2000;

export interface RateLimitRule {
  /** 时间窗口（毫秒）。 */
  windowMs: number;
  /** 窗口内最多几次。 */
  max: number;
}

/**
 * 记一次并判断是否放行。
 * @param key 一般用 `${行为}:${ip}`。
 * @returns true = 放行；false = 超限。
 */
export function allow(key: string, rule: RateLimitRule): boolean {
  const now = Date.now();

  if (buckets.size > SWEEP_THRESHOLD) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (bucket === undefined || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= rule.max;
}

function fromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * 提交限流：**一小时 120 次**。
 *
 * 这个数字是这么定的：真人一次约会最多交两三次，就算十来个好友挤在同一个
 * 出口 IP（公司 / 家里的 WiFi）也远远够用；而爬虫几秒钟就能撞到上限。
 * 一开始我定的 20 次 / 10 分钟太紧 —— 连自己的冒烟测试都跑不过。
 * 需要时可以 SUBMIT_RATE_MAX / SUBMIT_RATE_WINDOW_MIN 覆盖。
 */
export const SUBMIT_RULE: RateLimitRule = {
  windowMs: fromEnv('SUBMIT_RATE_WINDOW_MIN', 60) * 60 * 1000,
  max: fromEnv('SUBMIT_RATE_MAX', 120),
};

/**
 * 后台登录：10 分钟 40 次。
 *
 * 原来定 20，结果**自己反复登录调试就先撞上了** —— 一被限流，后面所有后台用例
 * 全变成 401，看起来像「token 失效」，很难往限流上想。
 * 40 次对「一个人偶尔登一下后台」绰绰有余，对暴力猜口令依然很紧
 * （10 分钟 40 次 = 一天不到 6000 次，配上长口令基本没戏）。
 */
export const LOGIN_RULE: RateLimitRule = {
  windowMs: fromEnv('LOGIN_RATE_WINDOW_MIN', 10) * 60 * 1000,
  max: fromEnv('LOGIN_RATE_MAX', 40),
};
