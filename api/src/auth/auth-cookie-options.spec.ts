import { describe, expect, it } from 'vitest';

import {
  createAuthCookieOptions,
  createClearCookieOptions,
} from '~/auth/auth-cookie-options';

describe('auth cookie options', () => {
  it.each([
    { expectedSameSite: 'lax', secure: false },
    { expectedSameSite: 'none', secure: true },
  ] as const)(
    'uses SameSite=$expectedSameSite when secure is $secure',
    ({ expectedSameSite, secure }) => {
      expect(createAuthCookieOptions(secure, 60_000)).toEqual({
        httpOnly: true,
        maxAge: 60_000,
        path: '/',
        sameSite: expectedSameSite,
        secure,
      });
      expect(createClearCookieOptions(secure)).toEqual({
        httpOnly: true,
        path: '/',
        sameSite: expectedSameSite,
        secure,
      });
    },
  );
});
