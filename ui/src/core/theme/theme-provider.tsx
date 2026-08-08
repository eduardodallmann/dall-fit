import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { toast } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Person, Theme } from '@dall-fit/types';

import {
  updateCurrentPersonConfigs,
  type MockAuthScenario,
} from '~/auth/auth-service';
import {
  ThemeContext,
  type ThemeContextValue,
} from '~/core/theme/theme-context';
import {
  applyTheme,
  getPublicThemeState,
  getSystemTheme,
  removeStoredTheme,
  SYSTEM_DARK_MEDIA_QUERY,
  writeStoredTheme,
  type ThemeState,
} from '~/core/theme/theme-storage';

interface ConfirmedTheme {
  theme?: Theme;
}

interface AuthenticatedThemeOwner {
  mockScenario: MockAuthScenario;
}

interface UpdateThemeVariables {
  mockScenario: MockAuthScenario;
  rollback: ConfirmedTheme;
  theme: Theme;
}

interface ThemeProviderProps extends PropsWithChildren {
  initialTheme: ThemeState;
}

export function ThemeProvider({
  children,
  initialTheme,
}: Readonly<ThemeProviderProps>) {
  const queryClient = useQueryClient();
  const [themeState, setThemeState] = useState(initialTheme);
  const authenticatedOwnerRef = useRef<AuthenticatedThemeOwner | null>(null);
  const confirmedThemeRef = useRef<ConfirmedTheme>({});
  const mutationPendingRef = useRef(false);

  const applyThemeState = useCallback((state: ThemeState) => {
    applyTheme(state.theme);
    setThemeState(state);
  }, []);

  const mutation = useMutation({
    mutationFn: ({ mockScenario, theme }: UpdateThemeVariables) =>
      updateCurrentPersonConfigs(theme, mockScenario),
    onError: (_error, variables) => {
      if (variables.rollback.theme === undefined) {
        removeStoredTheme();
        applyThemeState({ source: 'system', theme: getSystemTheme() });
      } else {
        writeStoredTheme(variables.rollback.theme);
        applyThemeState({
          source: 'explicit',
          theme: variables.rollback.theme,
        });
      }

      toast.danger('Não foi possível salvar o tema. Tente novamente.');
    },
    onSuccess: (person) => {
      const confirmedTheme = person.configs.theme;

      if (confirmedTheme !== undefined) {
        writeStoredTheme(confirmedTheme);
        applyThemeState({ source: 'explicit', theme: confirmedTheme });
      }

      confirmedThemeRef.current = { theme: confirmedTheme };
      queryClient.setQueriesData<Person>(
        { queryKey: ['auth', 'current-person'] },
        person,
      );
    },
    onSettled: () => {
      mutationPendingRef.current = false;
    },
  });

  const reconcileAuthenticated = useCallback(
    (person: Person, mockScenario: MockAuthScenario) => {
      authenticatedOwnerRef.current = { mockScenario };
      confirmedThemeRef.current = { theme: person.configs.theme };

      if (person.configs.theme === undefined) {
        removeStoredTheme();
        applyThemeState({ source: 'system', theme: getSystemTheme() });

        return;
      }

      writeStoredTheme(person.configs.theme);
      applyThemeState({ source: 'explicit', theme: person.configs.theme });
    },
    [applyThemeState],
  );

  const reconcilePublic = useCallback(() => {
    authenticatedOwnerRef.current = null;
    confirmedThemeRef.current = {};
    applyThemeState(getPublicThemeState());
  }, [applyThemeState]);

  const toggleTheme = useCallback(() => {
    const authenticatedOwner = authenticatedOwnerRef.current;

    if (
      authenticatedOwner === null ||
      mutationPendingRef.current ||
      mutation.isPending
    ) {
      return;
    }

    mutationPendingRef.current = true;
    const nextTheme = themeState.theme === 'dark' ? 'light' : 'dark';
    const rollback = confirmedThemeRef.current;
    writeStoredTheme(nextTheme);
    applyThemeState({ source: 'explicit', theme: nextTheme });
    mutation.mutate({
      mockScenario: authenticatedOwner.mockScenario,
      rollback,
      theme: nextTheme,
    });
  }, [applyThemeState, mutation, themeState.theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY);
    const followSystemTheme = (event: MediaQueryListEvent) => {
      if (themeState.source !== 'system') {
        return;
      }

      applyThemeState({
        source: 'system',
        theme: event.matches ? 'dark' : 'light',
      });
    };

    mediaQuery.addEventListener('change', followSystemTheme);

    return () => {
      mediaQuery.removeEventListener('change', followSystemTheme);
    };
  }, [applyThemeState, themeState.source]);

  const value: ThemeContextValue = useMemo(
    () => ({
      isSaving: mutation.isPending,
      reconcileAuthenticated,
      reconcilePublic,
      theme: themeState.theme,
      toggleTheme,
    }),
    [
      mutation.isPending,
      reconcileAuthenticated,
      reconcilePublic,
      themeState.theme,
      toggleTheme,
    ],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
