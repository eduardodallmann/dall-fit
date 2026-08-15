import { useEffect } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { MockAuthScenario } from '~/auth/auth-service';
import { realtimeClient } from '~/core/realtime/realtime-client';

import { getAggregateMutationCoordinator } from './aggregate-mutation-coordinator';
import { trainingPlanKeys } from './training-plan-queries';

export function TrainingPlanRealtimeBridge({
  mockAuth,
}: Readonly<{ mockAuth?: MockAuthScenario }>) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const coordinator = getAggregateMutationCoordinator(queryClient);
    const reconcile = () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    };
    const unsubscribeReady = realtimeClient.onReady(reconcile);
    const unsubscribeInvalidation = realtimeClient.onInvalidation((event) => {
      const paused = coordinator.notifyExternalChange(event);
      if (paused === undefined) return;
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.lists(),
      });
      if (!paused) {
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === trainingPlanKeys.all[0] &&
            (query.queryKey[1] === 'detail' ||
              query.queryKey[1] === 'workout') &&
            query.queryKey[2] === event.resourceId,
        });
      }
    });
    realtimeClient.start(mockAuth);
    return () => {
      unsubscribeInvalidation();
      unsubscribeReady();
      realtimeClient.stop();
    };
  }, [mockAuth, queryClient]);

  return null;
}
