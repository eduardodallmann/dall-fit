import type {
  CsrfTokenResponse,
  CurrentPersonResponse,
  Person,
  Theme,
  UpdateCurrentPersonConfigsResponse,
} from '@dall-fit/types';

import {
  configureCsrfTokenFetcher,
  ensureConfiguredCsrfToken,
} from '~/auth/csrf-token';
import { apiClient } from '~/core/http/api-client';

export type MockAuthScenario =
  | 'admin'
  | 'admin-revoked'
  | 'authenticated'
  | 'csrf-refresh'
  | 'csrf-error'
  | 'error'
  | 'logout-error'
  | 'person'
  | 'theme-dark'
  | 'theme-light'
  | 'theme-save-error'
  | 'theme-save-error-unset'
  | 'theme-unset'
  | 'session-expired'
  | 'unauthenticated';

function getMockHeaders(mockScenario: MockAuthScenario) {
  const result =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { 'x-dall-fit-mock-auth': mockScenario }
      : undefined;

  return result;
}

export function getGoogleLoginUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');
  const result = `${apiUrl}/auth/google`;

  return result;
}

export async function getCurrentPerson(
  mockScenario: MockAuthScenario = 'authenticated',
  signal?: AbortSignal,
): Promise<Person> {
  const response = await apiClient.get<CurrentPersonResponse>('/auth/me', {
    headers: getMockHeaders(mockScenario),
    signal,
  });
  const result = response.data.data;

  return result;
}

export async function ensureCsrfToken(
  mockScenario: MockAuthScenario = 'authenticated',
): Promise<string> {
  configureCsrfTokenFetcher(() => fetchCsrfToken(mockScenario));
  const result = await ensureConfiguredCsrfToken();
  return result;
}

async function fetchCsrfToken(mockScenario: MockAuthScenario): Promise<string> {
  const response = await apiClient.get<CsrfTokenResponse>('/auth/csrf', {
    headers: getMockHeaders(mockScenario),
  });
  const result = response.data.data.token;
  return result;
}

export async function logout(
  mockScenario: MockAuthScenario = 'authenticated',
): Promise<void> {
  await apiClient.post('/auth/logout', undefined, {
    headers: getMockHeaders(mockScenario),
  });
}

export async function updateCurrentPersonConfigs(
  theme: Theme,
  mockScenario: MockAuthScenario = 'authenticated',
): Promise<Person> {
  const response = await apiClient.patch<UpdateCurrentPersonConfigsResponse>(
    '/auth/me/configs',
    { theme },
    { headers: getMockHeaders(mockScenario) },
  );
  const result = response.data.data;

  return result;
}
