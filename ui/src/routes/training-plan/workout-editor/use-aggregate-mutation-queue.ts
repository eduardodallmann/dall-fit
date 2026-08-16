import { useCallback } from 'react';

import { useAggregateMutationCoordinator } from '../aggregate-mutation-coordinator';
import type { VersionedMutationResult } from '../training-plan-service';

export function useAggregateMutationQueue(
  trainingPlanId: string,
  initialVersion: number,
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
    ): Promise<T> => coordinator.enqueue<T>(operation),
    [coordinator],
  );

  return { ...coordinator, enqueue };
}
