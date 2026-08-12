let csrfToken: string | undefined;
let csrfTokenPromise: Promise<string> | undefined;
let csrfTokenFetcher: (() => Promise<string>) | undefined;

export function configureCsrfTokenFetcher(
  fetcher: () => Promise<string>,
): void {
  csrfTokenFetcher = fetcher;
}

export function getCsrfToken(): string | undefined {
  return csrfToken;
}

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function clearCsrfToken(): void {
  csrfToken = undefined;
}

export function ensureConfiguredCsrfToken(): Promise<string> {
  if (csrfToken !== undefined) return Promise.resolve(csrfToken);
  if (csrfTokenPromise !== undefined) return csrfTokenPromise;
  if (csrfTokenFetcher === undefined)
    return Promise.reject(new Error('CSRF token fetcher is unavailable.'));

  csrfTokenPromise = csrfTokenFetcher()
    .then((token) => {
      csrfToken = token;
      return token;
    })
    .finally(() => {
      csrfTokenPromise = undefined;
    });
  return csrfTokenPromise;
}

export function refreshCsrfToken(): Promise<string> {
  clearCsrfToken();
  return ensureConfiguredCsrfToken();
}

export function resetCsrfTokenForTests(): void {
  csrfToken = undefined;
  csrfTokenPromise = undefined;
}
