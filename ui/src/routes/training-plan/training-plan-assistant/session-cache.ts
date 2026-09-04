import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type { TrainingPlanAssistantSession } from '@dall-fit/types';

export function commitAssistantSession(
  queryClient: QueryClient,
  queryKey: QueryKey,
  session: TrainingPlanAssistantSession | null,
): void {
  queryClient.setQueryData<TrainingPlanAssistantSession | null>(
    queryKey,
    (current) => {
      if (session === null || current === undefined || current === null)
        return session;
      return session.version >= current.version ? session : current;
    },
  );
}
