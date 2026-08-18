import type { QueryClient } from '@tanstack/react-query';

import type { MockAuthScenario } from '~/auth/auth-service';
import { currentPersonQueryOptions } from '~/auth/current-person-query';

export type RootProbeDecision = 'public-entry' | 'replace-with-dash';

export function getRootSessionProbeQueryOptions(
  scenario: MockAuthScenario = 'authenticated',
) {
  const sharedOptions = currentPersonQueryOptions(scenario);
  const result = {
    ...sharedOptions,
    staleTime: 0,
  };

  return result;
}

export async function probeRootSession(options: {
  mockAuth: MockAuthScenario;
  queryClient: QueryClient;
}): Promise<RootProbeDecision> {
  const { mockAuth, queryClient } = options;

  try {
    await queryClient.fetchQuery(getRootSessionProbeQueryOptions(mockAuth));
    const result = 'replace-with-dash' as const;

    return result;
  } catch {
    const result = 'public-entry' as const;

    return result;
  }
}
