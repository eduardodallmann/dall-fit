import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bootstrapTheme,
  getPublicThemeState,
  removeStoredTheme,
  THEME_STORAGE_KEY,
  writeStoredTheme,
} from '~/core/theme/theme-storage';

describe('theme storage bootstrap', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  });

  it.each(['light', 'dark'] as const)(
    'uses the valid local %s preference before the system',
    (theme) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      const matchMedia = vi
        .spyOn(window, 'matchMedia')
        .mockImplementation((query: string) => ({
          addEventListener: vi.fn(),
          addListener: vi.fn(),
          dispatchEvent: vi.fn(),
          matches: theme === 'light',
          media: query,
          onchange: null,
          removeEventListener: vi.fn(),
          removeListener: vi.fn(),
        }));

      const result = bootstrapTheme();

      expect(result).toEqual({ source: 'explicit', theme });
      expect(document.documentElement).toHaveAttribute('data-theme', theme);
      expect(matchMedia).not.toHaveBeenCalled();
    },
  );

  it('uses the dark system preference when no local value exists', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));

    expect(getPublicThemeState()).toEqual({ source: 'system', theme: 'dark' });
  });

  it('discards an invalid local value and uses the light system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');

    expect(getPublicThemeState()).toEqual({ source: 'system', theme: 'light' });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('keeps bootstrap available when local storage cannot be read', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

    expect(getPublicThemeState()).toEqual({ source: 'system', theme: 'light' });

    getItem.mockRestore();
  });

  it('keeps theme changes available when local storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    expect(() => writeStoredTheme('dark')).not.toThrow();
    expect(() => removeStoredTheme()).not.toThrow();
  });
});
