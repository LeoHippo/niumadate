import { useCallback, useEffect, useState } from 'react';
import type { Submission } from '@niumadate/shared';
import { api } from './api';
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
