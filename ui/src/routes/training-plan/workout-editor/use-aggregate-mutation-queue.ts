import { useCallback, useRef, useState } from 'react';

import axios from 'axios';

interface VersionedResult<T> {
  data: T;
  version: number;
}

function isTrainingPlanVersionConflict(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 412)
    return false;
  const data: unknown = error.response.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return false;
  const result =
    (data as Record<string, unknown>).code === 'TRAINING_PLAN_VERSION_CONFLICT';
  return result;
}

export function useAggregateMutationQueue(
  initialVersion: number,
  onConflict: () => void,
) {
  const chain = useRef(Promise.resolve());
  const version = useRef(initialVersion);
  const pausedRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [paused, setPaused] = useState(false);

  const enqueue = useCallback(
    <T>(
      operation: (currentVersion: number) => Promise<VersionedResult<T>>,
    ): Promise<T> => {
      if (pausedRef.current)
        return Promise.reject(new Error('Mutation queue is paused.'));
      setPendingCount((count) => count + 1);
      const task = chain.current.then(async () => {
        if (pausedRef.current) throw new Error('Mutation queue is paused.');
        try {
          const result = await operation(version.current);
          version.current = result.version;
          return result.data;
        } catch (error) {
          if (isTrainingPlanVersionConflict(error)) {
            pausedRef.current = true;
            setPaused(true);
            onConflict();
          }
          throw error;
        }
      });
      chain.current = task.then(
        () => undefined,
        () => undefined,
      );
      const finish = () => setPendingCount((count) => Math.max(0, count - 1));
      void task.then(finish, finish);
      return task;
    },
    [onConflict],
  );

  const reset = useCallback((nextVersion: number) => {
    version.current = nextVersion;
    pausedRef.current = false;
    setPaused(false);
  }, []);

  return { enqueue, isPending: pendingCount > 0, paused, reset };
}
