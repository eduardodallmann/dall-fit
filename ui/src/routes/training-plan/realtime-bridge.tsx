import { useEffect } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { realtimeClient } from '~/core/realtime/realtime-client';

import { getAggregateMutationCoordinator } from './aggregate-mutation-coordinator';
import { trainingPlanKeys } from './training-plan-queries';

export function TrainingPlanRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const coordinator = getAggregateMutationCoordinator(queryClient);
    const reconcile = () => {
      void queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    };
    const unsubscribeReady = realtimeClient.onReady(reconcile);
    const unsubscribeInvalidation = realtimeClient.onInvalidation((event) => {
      const paused = coordinator.notifyExternalChange(event);
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.libraries(),
      });
      if (paused === undefined) return;
      if (!paused) {
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === trainingPlanKeys.all[0] &&
            (query.queryKey[1] === 'detail' || query.queryKey[1] === 'workout'),
        });
      }
    });
    realtimeClient.start();
    return () => {
      unsubscribeInvalidation();
      unsubscribeReady();
      realtimeClient.stop();
    };
  }, [queryClient]);

  return null;
}
