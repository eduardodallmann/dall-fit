import type {
  CurrentPersonResponse,
  Person,
  StartGoogleLoginResponse,
  Theme,
  UpdateCurrentPersonConfigsResponse,
} from '@dall-fit/types';

import { apiClient } from '~/core/http/api-client';

export type MockAuthScenario =
  | 'admin'
  | 'authenticated'
  | 'error'
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

export async function startGoogleLogin(): Promise<string> {
  const response =
    await apiClient.post<StartGoogleLoginResponse>('/auth/google');
  const result = response.data.data.authorizationUrl;

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
