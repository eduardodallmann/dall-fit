import { useLayoutEffect } from 'react';

import { Toast } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { delay } from 'msw/utils/delay';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Person } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import { ThemeToggle } from '~/core/components/theme-toggle';
import { useTheme } from '~/core/theme/theme-context';
import { ThemeProvider } from '~/core/theme/theme-provider';
import { THEME_STORAGE_KEY } from '~/core/theme/theme-storage';
import {
  authenticatedPersonFixture,
  lightThemePersonFixture,
  personWithoutThemeFixture,
} from '~/mocks/fixtures/person';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';
import { mockServer } from '~/mocks/server';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

describe('ThemeProvider', () => {
  beforeEach(() => {
    trackUiEventMock.mockClear();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('reconciles an authenticated profile over the bootstrap preference', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    renderTheme(lightThemePersonFixture, 'theme-light', {
      source: 'explicit',
      theme: 'dark',
    });

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(
      screen.getByRole('button', { name: 'Ativar tema escuro' }),
    ).toBeInTheDocument();
  });

  it('removes a stale local preference and follows system changes without persisting them', async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      addEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      },
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: (
        _type: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      },
      removeListener: vi.fn(),
    }));
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    renderTheme(personWithoutThemeFixture, 'theme-unset', {
      source: 'explicit',
      theme: 'dark',
    });

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    for (const listener of listeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('applies a toggle optimistically and updates every current-person query on success', async () => {
    let requestCount = 0;
    mockServer.use(
      http.patch('*/auth/me/configs', async () => {
        requestCount += 1;
        await delay(50);
        return HttpResponse.json(
          { data: lightThemePersonFixture },
          createMockResponseInit(),
        );
      }),
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['auth', 'current-person', 'authenticated'],
      authenticatedPersonFixture,
    );
    renderTheme(
      authenticatedPersonFixture,
      'authenticated',
      { source: 'explicit', theme: 'dark' },
      queryClient,
    );

    const button = screen.getByRole('button', { name: 'Ativar tema claro' });
    await user.click(button);
    await user.click(button);

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Ativar tema escuro' }),
      ).not.toBeDisabled();
    });
    await waitFor(() => {
      expect(
        queryClient.getQueryData<Person>([
          'auth',
          'current-person',
          'authenticated',
        ])?.configs,
      ).toEqual({ theme: 'light' });
    });
    expect(requestCount).toBe(1);
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_started',
        operation: 'theme_update',
      }),
    );
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_completed',
        operation: 'theme_update',
        outcome: 'success',
      }),
    );
  });

  it('rolls back to the confirmed profile theme and announces a save failure', async () => {
    mockServer.use(
      http.patch('*/auth/me/configs', async () => {
        await delay(50);
        return HttpResponse.json(
          createMockApiError('SERVICE_UNAVAILABLE', 'Unavailable'),
          createMockResponseInit({ status: 503 }),
        );
      }),
    );
    const user = userEvent.setup();
    renderTheme(authenticatedPersonFixture, 'theme-save-error', {
      source: 'explicit',
      theme: 'dark',
    });

    await user.click(screen.getByRole('button', { name: 'Ativar tema claro' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    expect(
      await screen.findByText(
        'Não foi possível salvar o tema. Tente novamente.',
      ),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_completed',
        operation: 'theme_update',
        outcome: 'error',
      }),
    );
  });

  it('rolls back a profile without theme to the current system preference', async () => {
    mockServer.use(
      http.patch('*/auth/me/configs', async () => {
        await delay(50);
        return HttpResponse.json(
          createMockApiError('SERVICE_UNAVAILABLE', 'Unavailable'),
          createMockResponseInit({ status: 503 }),
        );
      }),
    );
    const user = userEvent.setup();
    renderTheme(personWithoutThemeFixture, 'theme-save-error-unset', {
      source: 'system',
      theme: 'light',
    });

    await user.click(
      screen.getByRole('button', { name: 'Ativar tema escuro' }),
    );

    await screen.findByText('Não foi possível salvar o tema. Tente novamente.');
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});

function ThemeHarness({
  mockScenario,
  person,
}: Readonly<{ mockScenario: MockAuthScenario; person: Person }>) {
  const { reconcileAuthenticated } = useTheme();

  useLayoutEffect(() => {
    reconcileAuthenticated(person, mockScenario);
  }, [mockScenario, person, reconcileAuthenticated]);

  return <ThemeToggle />;
}

function renderTheme(
  person: Person,
  mockScenario: MockAuthScenario,
  initialTheme: { source: 'explicit' | 'system'; theme: 'dark' | 'light' },
  queryClient = new QueryClient(),
) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialTheme={initialTheme}>
        <ThemeHarness mockScenario={mockScenario} person={person} />
        <Toast.Provider />
      </ThemeProvider>
    </QueryClientProvider>,
  );

  return result;
}
