import { queryOptions } from '@tanstack/react-query';
import axios from 'axios';

import type { ApiResponse, TermsAccess } from '@dall-fit/types';

import { getSessionChannel } from '~/auth/session-channel';
import {
  getActiveSessionGeneration,
  isSessionGenerationActive,
} from '~/auth/session-lifecycle';
import { apiClient } from '~/core/http/api-client';
import {
  applyTermsAccess,
  parseTermsReference,
  readNativeTerms,
  termsUnavailable,
} from '~/core/terms/policy';

export const termsKeys = {
  all: ['terms'] as const,
  access: ['terms', 'access'] as const,
};
export function termsMockHeaders(): Record<string, string> {
  let scenario = new URLSearchParams(window.location.search).get('mockTerms');
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true') {
    if (scenario !== null)
      document.cookie = `dall-fit-mock-terms=${encodeURIComponent(scenario)}; Path=/; SameSite=Lax`;
    else
      scenario =
        document.cookie
          .split('; ')
          .find((item) => item.startsWith('dall-fit-mock-terms='))
          ?.split('=')[1] ?? null;
  }
  return import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_API_MOCKS === 'true' &&
    scenario !== null
    ? { 'x-dall-fit-mock-terms': scenario }
    : {};
}
function assertTermsAccess(access: TermsAccess): void {
  if (
    !['accepted', 'required', 'not-configured'].includes(access.state) ||
    (access.state !== 'not-configured' &&
      parseTermsReference(access.current) === undefined) ||
    (access.state === 'accepted' &&
      (access.acceptance.accepted !== true ||
        access.acceptance.isAdult !== true ||
        access.acceptance.contentHash !== access.current.contentHash ||
        access.acceptance.termsVersionId !== access.current.id ||
        access.acceptance.publicationNumber !==
          access.current.publicationNumber))
  )
    throw new Error('Invalid terms access response.');
}
export function termsAccessQueryOptions() {
  return queryOptions({
    queryKey: termsKeys.access,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: () =>
      document.visibilityState === 'visible' ? 300_000 : false,
    queryFn: async ({ signal }) => {
      const generation = getActiveSessionGeneration();
      try {
        const { data } = await apiClient.get<ApiResponse<TermsAccess>>(
          '/terms/access',
          { signal, headers: termsMockHeaders() },
        );
        const access = data.data;
        assertTermsAccess(access);
        return await applyTermsAccess(access, generation);
      } catch (error: unknown) {
        if (
          !isSessionGenerationActive(generation) ||
          signal.aborted ||
          axios.isCancel(error)
        )
          throw error;
        const transient =
          axios.isAxiosError(error) &&
          (error.response === undefined || error.response.status >= 500);
        if (getSessionChannel() === 'native' && transient) {
          try {
            const local = await readNativeTerms();
            if (local !== null)
              return await applyTermsAccess(local, generation, true);
          } catch {
            /* Missing or unreadable durable proof must keep access closed. */
          }
        }
        if (!isSessionGenerationActive(generation)) throw error;
        termsUnavailable();
        throw error;
      }
    },
  });
}
