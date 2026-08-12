import { queryOptions } from '@tanstack/react-query';

import { getCurrentPerson, type MockAuthScenario } from '~/auth/auth-service';
import { shouldRetryQuery } from '~/core/http/http-error';

export const CURRENT_PERSON_STALE_TIME = 30_000;
export const CURRENT_PERSON_REFETCH_INTERVAL = 5 * 60_000;

export function currentPersonQueryOptions(
  mockScenario: MockAuthScenario = 'authenticated',
) {
  const result = queryOptions({
    queryKey: ['auth', 'current-person', mockScenario],
    queryFn: ({ signal }) => getCurrentPerson(mockScenario, signal),
    refetchInterval: CURRENT_PERSON_REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    retry: shouldRetryQuery,
    staleTime: CURRENT_PERSON_STALE_TIME,
  });

  return result;
}
