import type { CookieOptions } from 'express';

export function createSessionCookieOptions(
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

export function createOAuthCookieOptions(
  secure: boolean,
  maxAge: number,
): CookieOptions {
  const result: CookieOptions = {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax',
    secure,
  };

  return result;
}

export function createClearSessionCookieOptions(
  secure: boolean,
): CookieOptions {
  const result: CookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: secure ? 'none' : 'lax',
    secure,
  };

  return result;
}

export function createClearOAuthCookieOptions(secure: boolean): CookieOptions {
  const result: CookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure,
  };

  return result;
}
