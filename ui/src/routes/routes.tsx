import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import axios from 'axios';

import type { MockAuthScenario } from '~/auth/auth-service';
import { currentPersonQueryOptions } from '~/auth/current-person-query';
import { queryClient } from '~/context/query-client';
import {
  ProtectedRouteError,
  ProtectedRoutePending,
} from '~/core/components/route-status';
import { assertAdminAccess } from '~/routes/admin-access';
import {
  AuthenticatedRouteComponent,
  DashRouteComponent,
  HomeRouteComponent,
} from '~/routes/route-components';

interface RouterContext {
  queryClient: QueryClient;
}

interface HomeSearch {
  authError?: 'oauth_failed';
}

interface DashSearch {
  mockAuth?: MockAuthScenario;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const result =
      search.authError === 'oauth_failed'
        ? { authError: 'oauth_failed' as const }
        : {};

    return result;
  },
  component: HomeRouteComponent,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated',
  beforeLoad: async ({ context, location }) => {
    const mockAuth = parseMockAuthScenario(location.searchStr);

    try {
      const person = await context.queryClient.ensureQueryData(
        currentPersonQueryOptions(mockAuth),
      );
      const result = { person };

      return result;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        redirect({ replace: true, throw: true, to: '/' });
      }

      throw error;
    }
  },
  component: AuthenticatedRouteComponent,
  errorComponent: ProtectedRouteError,
  pendingComponent: ProtectedRoutePending,
});

export const adminRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: '_admin',
  beforeLoad: ({ context }) => {
    assertAdminAccess(context.person);
    const result = {};

    return result;
  },
  component: Outlet,
});

const dashRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/dash',
  validateSearch: (search: Record<string, unknown>): DashSearch => {
    const mockAuth: MockAuthScenario | undefined =
      search.mockAuth === 'admin' ||
      search.mockAuth === 'error' ||
      search.mockAuth === 'unauthenticated'
        ? search.mockAuth
        : undefined;
    const result = mockAuth === undefined ? {} : { mockAuth };

    return result;
  },
  component: DashRouteComponent,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  authenticatedRoute.addChildren([dashRoute]),
]);

export const router = createRouter({
  context: { queryClient },
  defaultPreload: 'intent',
  routeTree,
});

function parseMockAuthScenario(search: string): MockAuthScenario {
  const value = new URLSearchParams(search).get('mockAuth');
  const result =
    value === 'admin' || value === 'error' || value === 'unauthenticated'
      ? value
      : 'authenticated';

  return result;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
