import type {
  CurrentPersonResponse,
  Person,
  StartGoogleLoginResponse,
} from '@dall-fit/types';

import { apiClient } from '~/core/http/api-client';

export type MockAuthScenario = 'authenticated' | 'error' | 'unauthenticated';

export async function startGoogleLogin(): Promise<string> {
  const response =
    await apiClient.post<StartGoogleLoginResponse>('/auth/google');
  const result = response.data.data.authorizationUrl;

  return result;
}

export async function getCurrentPerson(
  mockScenario: MockAuthScenario = 'authenticated',
): Promise<Person> {
  const headers =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { 'x-dall-fit-mock-auth': mockScenario }
      : undefined;
  const response = await apiClient.get<CurrentPersonResponse>('/auth/me', {
    headers,
  });
  const result = response.data.data;

  return result;
}
