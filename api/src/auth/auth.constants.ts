export const AUTH_SESSION_COOKIE = 'dall_fit_session';
export const AUTH_SESSION_COOKIE_SECURE = '__Host-dall_fit_session';
export const AUTH_LEGACY_SESSION_COOKIES = [
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_COOKIE_SECURE,
] as const;
export const OAUTH_STATE_COOKIE = 'dall_fit_oauth_state';
export const OAUTH_NONCE_COOKIE = 'dall_fit_oauth_nonce';
export const OAUTH_CODE_VERIFIER_COOKIE = 'dall_fit_oauth_code_verifier';
export const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
export const AUTH_TEST_KEY_HEADER = 'x-auth-test-key';
export const CSRF_HEADER = 'x-csrf-token';

export function getAuthSessionCookieName(secure: boolean): string {
  const result = secure ? AUTH_SESSION_COOKIE_SECURE : AUTH_SESSION_COOKIE;

  return result;
}
