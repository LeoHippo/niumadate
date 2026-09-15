import { useCallback, useEffect, useState } from 'react';
import type { RoleKey, Submission } from '@niumadate/shared';
import { api } from './api';
import { useConfig } from './config-context';
import { getDeviceId } from './lib';

export interface MySubmission {
  /** undefined = 还在查；null = 确实没提交过 */
  submission: Submission | null | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * 查「这台设备 + 这个身份」最近的一条申请。
 *
 * 填写页和状态页都要用它，所以抽出来，省得两边逻辑跑偏。
 */
export function useMySubmission(roleKey: string): MySubmission {
  const [submission, setSubmission] = useState<Submission | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const deviceId = getDeviceId();

  useEffect(() => {
    if (roleKey === '') return;
    let alive = true;

    void (async () => {
      try {
        const result = await api.mySubmission(deviceId, roleKey);
        if (alive) setSubmission(result.submission);
      } catch (cause) {
        console.warn('[submission] 查询历史申请失败，按「还没提交过」处理', cause);
        if (alive) setSubmission(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [deviceId, roleKey, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { submission, loading: submission === undefined, reload };
}

export interface LatestSubmission {
  role: RoleKey;
  submission: Submission;
}

/**
 * 查「这台设备」在**所有身份**里最新的那一条申请。
 *
 * 入口页要用它决定一件事：好友点开链接时，是让他重新选身份，
 * 还是**直接把他送回自己的状态页**。
 *
 * 大多数人点这个链接，想看的是「我那件事办得怎么样了」，
 * 而不是又看一遍「先刷一下身份」。
 *
 * 服务端只有「按身份查」这一个接口，所以这里并发查所有 **开启的** 身份，
 * 取提交时间最新的那条。身份最多四个、每条记录都很小，
 * 比为了入口页专门加一个接口简单得多。
 */
export interface MySubmissions {
  /** 按提交时间倒序；undefined = 还在查，null 不会出现（查不到就是空数组） */
  all: LatestSubmission[] | undefined;
  latest: LatestSubmission | null | undefined;
  loading: boolean;
}

export function useMySubmissions(): MySubmissions {
  const config = useConfig();
  const [all, setAll] = useState<LatestSubmission[] | undefined>(undefined);
  const deviceId = getDeviceId();

  // 只查开启的身份：关掉的身份本来就不该有新的申请
  const keys = config.roles.filter((role) => role.enabled).map((role) => role.key);
  const keySignature = keys.join(',');

  useEffect(() => {
    if (keys.length === 0) {
      setAll([]);
      return;
    }
    let alive = true;

    void (async () => {
      try {
        const results = await Promise.all(
          keys.map(async (role) => {
            const result = await api.mySubmission(deviceId, role);
            return result.submission === null ? null : { role, submission: result.submission };
          }),
        );
        const found = results.filter((item): item is LatestSubmission => item !== null);
        // 提交时间倒序：最近交的排最前
        found.sort((a, b) => b.submission.createdAt.localeCompare(a.submission.createdAt));
        if (alive) setAll(found);
      } catch (cause) {
        // 查不到就当作「没提交过」，绝不能因为查询失败把好友挡在门外
        console.warn('[submission] 查询本机申请失败，按「没提交过」处理', cause);
        if (alive) setAll([]);
      }
    })();

    return () => {
      alive = false;
    };
    // keySignature 是 keys 的稳定形式，避免每次渲染都重查
  }, [deviceId, keySignature]);

  return {
    all,
    latest: all === undefined ? undefined : (all[0] ?? null),
    loading: all === undefined,
  };
}
