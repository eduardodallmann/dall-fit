import { QueryClientProvider } from '@tanstack/react-query';
import type * as TanStackRouter from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NativeSessionContext } from '~/auth/native-session-context';
import { queryClient } from '~/context/query-client';
import { AuthenticatedShell } from '~/core/components/authenticated-shell';
import {
  createPlatformSnapshot,
  PlatformContext,
} from '~/core/platform/platform';
import { PwaContext } from '~/core/pwa/pwa-context';
import { ThemeContext } from '~/core/theme/theme-context';
import { authenticatedPersonFixture } from '~/mocks/fixtures/person';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

vi.mock('~/core/components/application-menu', () => ({
  ApplicationMenu: () => null,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, useRouter: () => ({ navigate: vi.fn() }) };
});

const pwaContextValue = {
  dismissUpdate: vi.fn(),
  install: vi.fn().mockResolvedValue(undefined),
  installationMode: 'manual' as const,
  isInstalling: false,
  isUpdating: false,
  updateFailed: false,
  update: vi.fn().mockResolvedValue(undefined),
};
const themeContextValue = {
  isSaving: false,
  reconcileAuthenticated: vi.fn(),
  reconcilePublic: vi.fn(),
  theme: 'dark' as const,
  toggleTheme: vi.fn(),
};

describe('AuthenticatedShell analytics', () => {
  beforeEach(() => {
    trackUiEventMock.mockClear();
  });

  it('tracks one mobile menu opening and its explicit close reason', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <PlatformContext value={createPlatformSnapshot('web', false)}>
          <NativeSessionContext value={null}>
            <ThemeContext value={themeContextValue}>
              <PwaContext value={pwaContextValue}>
                <AuthenticatedShell person={authenticatedPersonFixture}>
                  <p>Conteúdo</p>
                </AuthenticatedShell>
              </PwaContext>
            </ThemeContext>
          </NativeSessionContext>
        </PlatformContext>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(
      await screen.findByRole('dialog', { name: 'Menu da aplicação' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Fechar menu' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Menu da aplicação' }),
      ).not.toBeInTheDocument(),
    );
    expect(trackUiEventMock).toHaveBeenCalledWith({
      control: 'mobile_menu',
      eventName: 'ui_menu_opened',
      menu: 'application',
      surface: 'authenticated_shell',
    });
    expect(trackUiEventMock).toHaveBeenCalledWith({
      control: 'mobile_menu',
      eventName: 'ui_overlay_closed',
      overlay: 'application_menu',
      reason: 'close_trigger',
      surface: 'authenticated_shell',
    });

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(
      await screen.findByRole('dialog', { name: 'Menu da aplicação' }),
    ).toBeVisible();
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Menu da aplicação' }),
      ).not.toBeInTheDocument(),
    );
    expect(trackUiEventMock).toHaveBeenLastCalledWith({
      control: 'mobile_menu',
      eventName: 'ui_overlay_closed',
      overlay: 'application_menu',
      reason: 'escape',
      surface: 'authenticated_shell',
    });
  });
});
