import { describe, expect, it } from 'vitest';

import { getCurrentPerson, startGoogleLogin } from '~/auth/auth-service';
import { authenticatedPersonFixture } from '~/mocks/fixtures/person';

describe('authService', () => {
  it('loads the current person through the API client and MSW', async () => {
    await expect(getCurrentPerson()).resolves.toEqual(
      authenticatedPersonFixture,
    );
  });

  it('prepares login through the API and returns its authorization URL', async () => {
    await expect(startGoogleLogin()).resolves.toBe('http://localhost:4000/me');
  });
});
