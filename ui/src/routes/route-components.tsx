import { Outlet, useRouteContext, useSearch } from '@tanstack/react-router';

import { AuthenticatedShell } from '~/core/components/authenticated-shell';
import { HomePage } from '~/routes/home';

export function AuthenticatedRouteComponent() {
  const { person } = useRouteContext({ from: '/_authenticated' });
  const result = (
    <AuthenticatedShell person={person}>
      <Outlet />
    </AuthenticatedShell>
  );

  return result;
}

export function HomeRouteComponent() {
  const search = useSearch({ from: '/' });
  const result = (
    <HomePage hasAuthError={search.authError === 'oauth_failed'} />
  );

  return result;
}

export function DashRouteComponent() {
  const result = null;

  return result;
}
