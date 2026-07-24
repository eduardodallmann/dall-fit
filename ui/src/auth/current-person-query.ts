import { queryOptions } from '@tanstack/react-query';

import { getCurrentPerson, type MockAuthScenario } from '~/auth/auth-service';

export function currentPersonQueryOptions(
  mockScenario: MockAuthScenario = 'authenticated',
) {
  const result = queryOptions({
    queryKey: ['auth', 'current-person', mockScenario],
    queryFn: () => getCurrentPerson(mockScenario),
    retry: false,
  });

  return result;
}
