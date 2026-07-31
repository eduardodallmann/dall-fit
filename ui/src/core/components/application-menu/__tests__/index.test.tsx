import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Person } from '@dall-fit/types';

import { ApplicationMenu } from '~/core/components/application-menu';
import { authenticatedPersonFixture } from '~/mocks/fixtures/person';

describe('ApplicationMenu', () => {
  it('shows the authenticated identity and active Home navigation', async () => {
    await renderApplicationMenu(authenticatedPersonFixture);

    expect(
      screen.getByRole('img', { name: 'Alex Runner' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Alex Runner')).toBeInTheDocument();
    expect(screen.getByText('alex.runner@example.test')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Navegação principal' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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
  });

  it('notifies the mobile shell when Home is activated', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    await renderApplicationMenu(authenticatedPersonFixture, onNavigate);

    await user.click(screen.getByRole('link', { name: 'Home' }));

    expect(onNavigate).toHaveBeenCalledOnce();
  });
});

async function renderApplicationMenu(
  person: Person,
  onNavigate?: () => void,
): Promise<void> {
  const rootRoute = createRootRoute();
  const dashRoute = createRoute({
    component: () => (
      <ApplicationMenu onNavigate={onNavigate} person={person} />
    ),
    getParentRoute: () => rootRoute,
    path: '/dash',
  });
  const testRouter = createRouter({
    history: createMemoryHistory({ initialEntries: ['/dash'] }),
    routeTree: rootRoute.addChildren([dashRoute]),
  });

  await testRouter.load();
  render(<RouterProvider router={testRouter} />);
}
