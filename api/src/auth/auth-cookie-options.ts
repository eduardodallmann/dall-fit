import type { CookieOptions } from 'express';

export function createAuthCookieOptions(
  secure: boolean,
  maxAge: number,
): CookieOptions {
  const result: CookieOptions = {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: secure ? 'none' : 'lax',
    secure,
  };

  return result;
}

export function createClearCookieOptions(secure: boolean): CookieOptions {
  const result: CookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: secure ? 'none' : 'lax',
    secure,
  };

  return result;
}
