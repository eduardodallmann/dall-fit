import { useRouteContext, useSearch } from '@tanstack/react-router';

import { HomePage } from '~/routes/home';
import { MePage } from '~/routes/me';

export function HomeRouteComponent() {
  const search = useSearch({ from: '/' });
  const result = (
    <HomePage hasAuthError={search.authError === 'oauth_failed'} />
  );

  return result;
}

export function MeRouteComponent() {
  const { person } = useRouteContext({ from: '/_authenticated' });
  const result = <MePage person={person} />;

  return result;
}
