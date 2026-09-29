import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAdminDashboardFixture,
  createDashboardFixture,
} from '~/mocks/fixtures/dashboard';
import { DashboardPage } from '~/routes/dashboard';
import * as service from '~/routes/dashboard/dashboard-service';

const { navigateMock, trackUiEventMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  trackUiEventMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ trackUiEvent: trackUiEventMock }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigateMock,
}));
vi.mock('~/routes/dashboard/dashboard-service', async (importOriginal) => {
  const actual = await importOriginal<typeof service>();
  return {
    ...actual,
    getAdminDashboard: vi.fn(),
    getDashboard: vi.fn(),
  };
});

function renderDashboard(isAdmin = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage
        isAdmin={isAdmin}
        scenario={isAdmin ? 'admin' : 'personal'}
      />
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    trackUiEventMock.mockReset();
    vi.mocked(service.getDashboard).mockReset();
    vi.mocked(service.getAdminDashboard).mockReset();
    vi.mocked(service.getDashboard).mockResolvedValue(
      createDashboardFixture('personal'),
    );
    vi.mocked(service.getAdminDashboard).mockResolvedValue(
      createAdminDashboardFixture(),
    );
  });

  it('renders the personal metrics, eight textual trend items and recent links', async () => {
    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: 'Visão geral', level: 1 }),
    ).toBeVisible();
    expect(await screen.findByText('9')).toBeVisible();
    expect(screen.getByText('6 h')).toBeVisible();
    expect(screen.getAllByRole('meter')).toHaveLength(8);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(service.getAdminDashboard).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Visão administrativa' }),
    ).not.toBeInTheDocument();
  });

  it('renders administrative aggregates after the complete personal dashboard', async () => {
    renderDashboard(true);

    const heading = await screen.findByRole('heading', {
      name: 'Visão administrativa',
      level: 2,
    });
    expect(await screen.findByText('142')).toBeVisible();
    expect(
      screen.getByRole('grid', { name: 'Modelos mais utilizados' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Atividades recentes' }),
    ).toBeVisible();
    expect(
      screen
        .getByRole('heading', { name: 'Visão geral' })
        .compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    ['empty', 'Escolher um plano', '/training-plan'],
    ['personal', 'Começar treino', '/training/workout/$workoutId'],
    ['session-running', 'Retomar treino', '/training/workout/$workoutId'],
  ] as const)('navigates the %s next action', async (state, label, to) => {
    vi.mocked(service.getDashboard).mockResolvedValue(
      createDashboardFixture(state),
    );
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: label }));

    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to }));
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        control: 'dashboard_action',
        eventName: 'ui_navigation_selected',
      }),
    );
  });

  it('recovers the personal content with an explicit retry', async () => {
    vi.mocked(service.getDashboard)
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(createDashboardFixture('personal'));
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole('button', { name: 'Tentar novamente' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Atividades recentes' }),
    ).toBeVisible();
    expect(trackUiEventMock).toHaveBeenCalledWith({
      control: 'retry',
      eventName: 'ui_retry_requested',
      resource: 'dashboard',
      surface: 'dashboard',
    });
  });

  it('isolates an administrative failure from the personal data', async () => {
    vi.mocked(service.getAdminDashboard).mockRejectedValue(
      new Error('unavailable'),
    );
    renderDashboard(true);

    expect(
      await screen.findByText(
        'Não foi possível carregar a visão administrativa.',
      ),
    ).toBeVisible();
    expect(screen.getByText('9')).toBeVisible();
    await waitFor(() => expect(service.getDashboard).toHaveBeenCalledTimes(1));
  });
});
