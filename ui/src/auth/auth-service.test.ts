import { describe, expect, it } from 'vitest';

import {
  ensureCsrfToken,
  getCurrentPerson,
  getGoogleLoginUrl,
  updateCurrentPersonConfigs,
} from '~/auth/auth-service';
import { authenticatedPersonFixture } from '~/mocks/fixtures/person';

describe('authService', () => {
  it('loads the current person through the API client and MSW', async () => {
    await expect(getCurrentPerson()).resolves.toEqual(
      authenticatedPersonFixture,
    );
  });

  it('builds the top-level Google login endpoint', () => {
    expect(getGoogleLoginUrl()).toBe('http://localhost:4000/auth/google');
  });

  it('updates the current person theme through the API client and MSW', async () => {
    await ensureCsrfToken();
    const result = await updateCurrentPersonConfigs('light');

    expect(result.configs).toEqual({ theme: 'light' });
  });
});
