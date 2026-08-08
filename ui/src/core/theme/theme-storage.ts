import type { Theme } from '@dall-fit/types';

export const THEME_STORAGE_KEY = 'dall-fit:theme';
export const SYSTEM_DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export type ThemeSource = 'explicit' | 'system';

export interface ThemeState {
  source: ThemeSource;
  theme: Theme;
}

export function isTheme(value: unknown): value is Theme {
  const result = value === 'light' || value === 'dark';

  return result;
}

export function getSystemTheme(): Theme {
  const result = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches
    ? 'dark'
    : 'light';

  return result;
}

export function readStoredTheme(): Theme | undefined {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    const result = isTheme(value) ? value : undefined;

    if (value !== null && result === undefined) {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    }

    return result;
  } catch {
    const result = undefined;

    return result;
  }
}

export function writeStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function removeStoredTheme(): void {
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    return;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function getPublicThemeState(): ThemeState {
  const storedTheme = readStoredTheme();
  const result: ThemeState =
    storedTheme === undefined
      ? { source: 'system', theme: getSystemTheme() }
      : { source: 'explicit', theme: storedTheme };

  return result;
}

export function bootstrapTheme(): ThemeState {
  const result = getPublicThemeState();
  applyTheme(result.theme);

  return result;
}
