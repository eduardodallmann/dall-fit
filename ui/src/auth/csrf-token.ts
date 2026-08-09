let csrfToken: string | undefined;

export const AUTHENTICATION_REQUIRED_EVENT = 'dall-fit:authentication-required';

export function getCsrfToken(): string | undefined {
  return csrfToken;
}

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function clearCsrfToken(): void {
  csrfToken = undefined;
}
