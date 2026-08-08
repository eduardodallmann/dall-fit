import { createContext, use } from 'react';

import type { Person, Theme } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';

export interface ThemeContextValue {
  isSaving: boolean;
  reconcileAuthenticated: (
    person: Person,
    mockScenario: MockAuthScenario,
  ) => void;
  reconcilePublic: () => void;
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);

  if (value === null) {
    throw new Error('useTheme must be used inside ThemeProvider.');
  }

  return value;
}
