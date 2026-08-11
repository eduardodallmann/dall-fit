import { useCallback } from 'react';

import {
  isTrainingPlanVersionConflict,
  useAggregateMutationCoordinator,
} from '../aggregate-mutation-coordinator';
import type { VersionedMutationResult } from '../training-plan-service';

export function useAggregateMutationQueue(
  trainingPlanId: string,
  initialVersion: number,
  onConflict: () => void,
) {
  const coordinator = useAggregateMutationCoordinator(
    trainingPlanId,
    initialVersion,
  );

  const enqueue = useCallback(
    <T>(
      operation: (
        currentVersion: number,
      ) => Promise<VersionedMutationResult<T>>,
    ): Promise<T> => {
      const task = coordinator.enqueue<T>(operation);
      return task.catch((error: unknown) => {
        if (isTrainingPlanVersionConflict(error)) onConflict();
        throw error;
      });
    },
    [coordinator, onConflict],
  );

  return { ...coordinator, enqueue };
}
