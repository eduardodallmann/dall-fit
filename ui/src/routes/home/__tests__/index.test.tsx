import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '~/context/providers';
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
});
