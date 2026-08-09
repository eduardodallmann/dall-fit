import { useLayoutEffect } from 'react';

import { Outlet, useRouteContext, useSearch } from '@tanstack/react-router';

import { AuthenticatedShell } from '~/core/components/authenticated-shell';
import { useTheme } from '~/core/theme/theme-context';
import { HomePage } from '~/routes/home';

export function AuthenticatedRouteComponent() {
  const { mockAuth, person } = useRouteContext({ from: '/_authenticated' });
  const { reconcileAuthenticated } = useTheme();

  useLayoutEffect(() => {
    reconcileAuthenticated(person, mockAuth);
  }, [mockAuth, person, reconcileAuthenticated]);

  const result = (
    <AuthenticatedShell mockAuth={mockAuth} person={person}>
      <Outlet />
    </AuthenticatedShell>
  );

  return result;
}

export function HomeRouteComponent() {
  const search = useSearch({ from: '/' });
  const { reconcilePublic } = useTheme();

  useLayoutEffect(() => {
    reconcilePublic();
  }, [reconcilePublic]);

  const result = (
    <HomePage hasAuthError={search.authError === 'oauth_failed'} />
  );

  return result;
}

export function DashRouteComponent() {
  const result = null;

  return result;
}
