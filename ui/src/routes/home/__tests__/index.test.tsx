import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeSessionCoordinator } from '~/auth/native-session';
import { AppProviders } from '~/context/providers';
import { createPlatformSnapshot } from '~/core/platform/platform';
import { HomePage } from '~/routes/home';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

vi.mock('~/auth/auth-service', () => ({
  getGoogleLoginUrl: () => '#google-login',
}));

describe('HomePage', () => {
  beforeEach(() => {
    trackUiEventMock.mockClear();
  });

  it('renders the public login entry', () => {
    render(
      <AppProviders>
        <HomePage />
      </AppProviders>,
    );

    expect(
      screen.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Não foi possível entrar.'),
    ).not.toBeInTheDocument();
  });

  it('shows a recoverable callback error without removing the login action', () => {
    render(
      <AppProviders>
        <HomePage hasAuthError />
      </AppProviders>,
    );

    expect(screen.getByText('Não foi possível entrar.')).toBeInTheDocument();
    expect(screen.getByText('Tente novamente.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeInTheDocument();
  });

  it('tracks only login intent before top-level navigation', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <HomePage />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_started',
        operation: 'google_login',
      }),
    );
    expect(trackUiEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'ui_operation_completed' }),
    );
  });

  it('uses the injected native sign-in only after an explicit action', async () => {
    const user = userEvent.setup();
    const onNativeAuthenticated = vi.fn();
    const login = vi.fn(() =>
      Promise.resolve({
        person: { id: 'person-native' },
        status: 'authenticated' as const,
      }),
    );
    const nativeSession = { login } as unknown as NativeSessionCoordinator;
    render(
      <AppProviders
        nativeSession={nativeSession}
        platform={createPlatformSnapshot('android', true)}
      >
        <HomePage onNativeAuthenticated={onNativeAuthenticated} />
      </AppProviders>,
    );

    expect(login).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    expect(login).toHaveBeenCalledOnce();
    expect(onNativeAuthenticated).toHaveBeenCalledOnce();
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_completed',
        outcome: 'success',
      }),
    );
  });

  it('keeps native cancellation silent and re-enables the action', async () => {
    const user = userEvent.setup();
    const login = vi.fn(() =>
      Promise.resolve({ status: 'cancelled' as const }),
    );
    render(
      <AppProviders
        nativeSession={{ login } as unknown as NativeSessionCoordinator}
        platform={createPlatformSnapshot('android', true)}
      >
        <HomePage />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    expect(
      screen.queryByText('Não foi possível entrar.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeEnabled();
  });
});
