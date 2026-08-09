import { describe, expect, it } from 'vitest';

import {
  createClearOAuthCookieOptions,
  createClearSessionCookieOptions,
  createOAuthCookieOptions,
  createSessionCookieOptions,
} from '~/auth/auth-cookie-options';

describe('auth cookie options', () => {
  it.each([
    { expectedSessionSameSite: 'lax', secure: false },
    { expectedSessionSameSite: 'none', secure: true },
  ] as const)(
    'configures session and OAuth cookies when secure is $secure',
    ({ expectedSessionSameSite, secure }) => {
      expect(createSessionCookieOptions(secure, 60_000)).toEqual({
        httpOnly: true,
        maxAge: 60_000,
        path: '/',
        sameSite: expectedSessionSameSite,
        secure,
      });
      expect(createClearSessionCookieOptions(secure)).toEqual({
        httpOnly: true,
        path: '/',
        sameSite: expectedSessionSameSite,
        secure,
      });
      expect(createOAuthCookieOptions(secure, 60_000)).toEqual({
        httpOnly: true,
        maxAge: 60_000,
        path: '/',
        sameSite: 'lax',
        secure,
      });
      expect(createClearOAuthCookieOptions(secure)).toEqual({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure,
      });
    },
  );
});
