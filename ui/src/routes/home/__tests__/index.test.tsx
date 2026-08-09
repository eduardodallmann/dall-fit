import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '~/context/providers';
import { mockServer } from '~/mocks/server';
import { HomePage } from '~/routes/home';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
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

  it('tracks login intent and a terminal failure without error content', async () => {
    mockServer.use(
      http.post('*/auth/google', () =>
        HttpResponse.json(
          { code: 'SERVICE_UNAVAILABLE', message: 'private provider detail' },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    render(
      <AppProviders>
        <HomePage />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(await screen.findByText('Não foi possível entrar.')).toBeVisible();
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_started',
        operation: 'google_login',
      }),
    );
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_operation_completed',
        operation: 'google_login',
        outcome: 'error',
      }),
    );
    expect(JSON.stringify(trackUiEventMock.mock.calls)).not.toContain(
      'private provider detail',
    );
  });
});
