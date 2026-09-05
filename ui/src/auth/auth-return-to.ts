const STORAGE_KEY = 'dall-fit:auth-return-to';
const MAX_AGE = 30 * 60_000;

type NormalizeDestination = (href: string) => string | undefined;

export function parseAuthReturnUrl(href: string): URL | undefined {
  try {
    if (!href.startsWith('/') || href.startsWith('//')) return undefined;
    const decoded = decodeURIComponent(href);
    if (
      decoded.includes('\\') ||
      [...decoded].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      })
    )
      return undefined;
    const pathname = href.split(/[?#]/, 1)[0];
    const url = new URL(href, 'https://dall-fit.invalid');
    if (
      url.origin !== 'https://dall-fit.invalid' ||
      url.pathname !== pathname ||
      url.pathname.includes('//') ||
      /%(?:2f|5c|25|2e|3f|23)/i.test(url.pathname)
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function createAuthReturnToStore(
  getStorage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () =>
    window.sessionStorage,
) {
  let unavailable = false;

  function clear(): boolean {
    try {
      getStorage().removeItem(STORAGE_KEY);
      return !unavailable;
    } catch {
      unavailable = true;
      return false;
    }
  }

  function read(normalize: NormalizeDestination): string | undefined {
    if (unavailable) return undefined;
    try {
      const raw = getStorage().getItem(STORAGE_KEY);
      if (raw === null) return undefined;
      const value: unknown = JSON.parse(raw);
      if (
        typeof value !== 'object' ||
        value === null ||
        !('href' in value) ||
        typeof value.href !== 'string' ||
        !('capturedAt' in value) ||
        typeof value.capturedAt !== 'number' ||
        !Number.isFinite(value.capturedAt) ||
        value.capturedAt > Date.now() ||
        Date.now() - value.capturedAt >= MAX_AGE
      ) {
        clear();
        return undefined;
      }
      const destination = normalize(value.href);
      if (destination === undefined) clear();
      return destination;
    } catch {
      clear();
      return undefined;
    }
  }

  function save(href: string, normalize: NormalizeDestination): void {
    if (unavailable) return;
    const destination = normalize(href);
    if (destination === undefined) {
      clear();
      return;
    }
    try {
      getStorage().setItem(
        STORAGE_KEY,
        JSON.stringify({
          capturedAt: Date.now(),
          href: destination,
        }),
      );
    } catch {
      clear();
      unavailable = true;
    }
  }

  function consume(normalize: NormalizeDestination): string | undefined {
    const destination = read(normalize);
    const removed = clear();
    return removed ? destination : undefined;
  }

  return { clear, consume, read, save };
}

export const authReturnTo = createAuthReturnToStore();
