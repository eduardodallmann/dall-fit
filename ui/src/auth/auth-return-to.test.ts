import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAuthReturnToStore,
  parseAuthReturnUrl,
} from '~/auth/auth-return-to';

const key = 'dall-fit:auth-return-to';
const normalize = (href: string) => {
  const url = parseAuthReturnUrl(href);
  return url?.pathname === '/training'
    ? `${url.pathname}${url.search}${url.hash}`
    : undefined;
};

describe('authentication return destination', () => {
  beforeEach(() => window.sessionStorage.clear());

  it.each([
    'https://example.test/training',
    '//example.test/training',
    'javascript:alert(1)',
    '/\\example.test',
    '/%5cexample.test',
    '/training\n',
    '/training%0a',
    '/training/../dash',
    '/training/%2e%2e/dash',
    '/training/%252fhost',
    '/training/%2fhost',
    '/training//other',
    '/training/%23fragment',
    '/training?bad=%',
  ])('rejects an unsafe destination: %s', (href) => {
    expect(parseAuthReturnUrl(href)).toBeUndefined();
  });

  it('survives a new document and consumes the latest destination once', () => {
    const firstDocument = createAuthReturnToStore();
    firstDocument.save('/training?mode=first#one', normalize);
    firstDocument.save('/training?mode=second#two', normalize);
    const nextDocument = createAuthReturnToStore();
    expect(nextDocument.consume(normalize)).toBe('/training?mode=second#two');
    expect(nextDocument.consume(normalize)).toBeUndefined();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('expires after 30 minutes without renewing on reads', () => {
    const store = createAuthReturnToStore();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    store.save('/training', normalize);
    vi.spyOn(Date, 'now').mockReturnValue(now + 29 * 60_000);
    expect(store.read(normalize)).toBe('/training');
    vi.spyOn(Date, 'now').mockReturnValue(now + 30 * 60_000);
    expect(store.consume(normalize)).toBeUndefined();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it.each([
    'broken',
    'null',
    '{}',
    '{"href":42,"capturedAt":0}',
    JSON.stringify({ href: '/training', capturedAt: Number.MAX_SAFE_INTEGER }),
    JSON.stringify({ href: '/unknown', capturedAt: Date.now() }),
  ])('discards malformed, future or unrecognized records: %s', (record) => {
    window.sessionStorage.setItem(key, record);
    expect(createAuthReturnToStore().consume(normalize)).toBeUndefined();
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it.each(['getItem', 'setItem', 'removeItem'] as const)(
    'degrades safely when %s fails',
    (method) => {
      const storage = {
        getItem: vi.fn(() =>
          JSON.stringify({ href: '/training', capturedAt: Date.now() }),
        ),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      const store = createAuthReturnToStore(() => storage);
      storage[method].mockImplementation(() => {
        throw new Error('Storage blocked');
      });
      if (method === 'setItem') store.save('/training#new', normalize);
      expect(store.consume(normalize)).toBeUndefined();
      expect(store.consume(normalize)).toBeUndefined();
    },
  );

  it('ignores a record for the rest of the document if removal failed', () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({ href: '/training', capturedAt: Date.now() }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(() => {
        throw new Error('Storage blocked');
      }),
    };
    const store = createAuthReturnToStore(() => storage);
    expect(store.consume(normalize)).toBeUndefined();
    storage.removeItem.mockReset();
    expect(store.consume(normalize)).toBeUndefined();
  });

  it('handles failure to obtain storage without falling back to localStorage', () => {
    const store = createAuthReturnToStore(() => {
      throw new Error('SecurityError');
    });
    store.save('/training', normalize);
    expect(store.consume(normalize)).toBeUndefined();
  });
});
