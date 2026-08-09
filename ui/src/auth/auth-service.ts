import type {
  CsrfTokenResponse,
  CurrentPersonResponse,
  Person,
  Theme,
  UpdateCurrentPersonConfigsResponse,
} from '@dall-fit/types';

import { getCsrfToken, setCsrfToken } from '~/auth/csrf-token';
import { apiClient } from '~/core/http/api-client';

export type MockAuthScenario =
  | 'admin'
  | 'authenticated'
  | 'csrf-error'
  | 'error'
  | 'logout-error'
  | 'theme-dark'
  | 'theme-light'
  | 'theme-save-error'
  | 'theme-save-error-unset'
  | 'theme-unset'
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
): Promise<Person> {
  const response = await apiClient.get<CurrentPersonResponse>('/auth/me', {
    headers: getMockHeaders(mockScenario),
  });
  const result = response.data.data;

  return result;
}

export async function ensureCsrfToken(
  mockScenario: MockAuthScenario = 'authenticated',
): Promise<string> {
  const currentToken = getCsrfToken();
  if (currentToken !== undefined) {
    return currentToken;
  }

  const response = await apiClient.get<CsrfTokenResponse>('/auth/csrf', {
    headers: getMockHeaders(mockScenario),
  });
  const result = response.data.data.token;
  setCsrfToken(result);

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
