import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Person } from '@dall-fit/types';

import { ApplicationMenu } from '~/core/components/application-menu';
import { PwaContext } from '~/core/pwa/pwa-context';
import { ThemeContext } from '~/core/theme/theme-context';
import { authenticatedPersonFixture } from '~/mocks/fixtures/person';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

const pwaContextValue = {
  dismissUpdate: vi.fn(),
  install: vi.fn().mockResolvedValue(undefined),
  installationMode: 'manual' as const,
  isInstalling: false,
  isUpdating: false,
  updateFailed: false,
  update: vi.fn().mockResolvedValue(undefined),
};

const toggleTheme = vi.fn();
const themeContextValue = {
  isSaving: false,
  reconcileAuthenticated: vi.fn(),
  reconcilePublic: vi.fn(),
  theme: 'dark' as const,
  toggleTheme,
};

describe('ApplicationMenu', () => {
  beforeEach(() => {
    trackUiEventMock.mockClear();
  });

  it('shows the authenticated identity and active Home navigation', async () => {
    await renderApplicationMenu(authenticatedPersonFixture);

    expect(
      screen.getByRole('img', { name: 'Alex Runner' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Alex Runner')).toBeInTheDocument();
    expect(screen.getByText('alex.runner@example.test')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ativar tema claro' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const logout = screen.getByRole('button', { name: 'Sair' });
    expect(logout).toBeInTheDocument();
    expect(logout).not.toHaveTextContent('Sair');
  });

  it('shows first and last initials without reserving admin space', async () => {
    await renderApplicationMenu({
      ...authenticatedPersonFixture,
      name: 'Taylor Morgan Fit',
      photoUrl: null,
    });

    expect(screen.getByText('TF')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows the admin indicator and keeps long identity values in the DOM', async () => {
    const person: Person = {
      ...authenticatedPersonFixture,
      email: 'alexander.runner.with.a.long.address@example.test',
      isAdmin: true,
      name: 'Alexandre Runner With A Very Long Display Name',
    };

    await renderApplicationMenu(person);

    expect(screen.getByText(person.name)).toBeInTheDocument();
    expect(screen.getByText(person.email)).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Planos globais' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Meus planos' }),
    ).toBeInTheDocument();
  });

  it('notifies the mobile shell when Home is activated', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    await renderApplicationMenu(authenticatedPersonFixture, onNavigate);

    await user.click(screen.getByRole('link', { name: 'Home' }));

    expect(onNavigate).toHaveBeenCalledOnce();
    expect(trackUiEventMock).toHaveBeenCalledWith({
      control: 'home_link',
      destination: 'dash',
      eventName: 'ui_navigation_selected',
      navigationKind: 'menu',
      surface: 'application_menu',
    });
  });

  it('requests logout when Sair is activated', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    await renderApplicationMenu(
      authenticatedPersonFixture,
      undefined,
      onLogout,
    );

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(onLogout).toHaveBeenCalledOnce();
  });
});

async function renderApplicationMenu(
  person: Person,
  onNavigate?: () => void,
  onLogout: () => void = vi.fn(),
): Promise<void> {
  const rootRoute = createRootRoute();
  const dashRoute = createRoute({
    component: () => (
      <ApplicationMenu
        onLogout={onLogout}
        onNavigate={onNavigate}
        person={person}
      />
    ),
    getParentRoute: () => rootRoute,
    path: '/dash',
  });
  const testRouter = createRouter({
    history: createMemoryHistory({ initialEntries: ['/dash'] }),
    routeTree: rootRoute.addChildren([dashRoute]),
  });

  await testRouter.load();
  render(
    <ThemeContext value={themeContextValue}>
      <PwaContext value={pwaContextValue}>
        <RouterProvider router={testRouter} />
      </PwaContext>
    </ThemeContext>,
  );
}
