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
import { TrainingPlanDetailPage } from '~/routes/training-plan/detail-page';
import { TrainingPlanListPage } from '~/routes/training-plan/list-page';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';
import { TrainingPlanWorkoutPage } from '~/routes/training-plan/workout-page';

interface RouterContext {
  queryClient: QueryClient;
}

interface HomeSearch {
  authError?: 'oauth_failed';
}

interface DashSearch {
  mockAuth?: MockAuthScenario;
}

interface TrainingPlanSearch extends DashSearch {
  mockTrainingPlans?: MockTrainingPlansScenario;
}

interface TrainingPlanListSearch extends TrainingPlanSearch {
  page?: number;
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
      const result = { mockAuth, person };

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
    const mockAuth: MockAuthScenario | undefined = isMockAuthScenario(
      search.mockAuth,
    )
      ? search.mockAuth
      : undefined;
    const result = mockAuth === undefined ? {} : { mockAuth };

    return result;
  },
  component: DashRouteComponent,
});

const trainingPlanListRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/global/training-plan',
  validateSearch: (search: Record<string, unknown>): TrainingPlanListSearch => {
    const common = parseTrainingPlanSearch(search);
    const numericPage = Number(search.page);
    const page =
      Number.isInteger(numericPage) && numericPage > 1
        ? numericPage
        : undefined;
    const result = page === undefined ? common : { ...common, page };

    return result;
  },
  component: TrainingPlanListRouteComponent,
});

const trainingPlanDetailRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/global/training-plan/$trainingPlanId',
  validateSearch: parseTrainingPlanSearch,
  component: TrainingPlanDetailRouteComponent,
});

const trainingPlanWorkoutRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/global/training-plan/$trainingPlanId/workout/$workoutId',
  validateSearch: parseTrainingPlanSearch,
  component: TrainingPlanWorkoutRouteComponent,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  authenticatedRoute.addChildren([
    dashRoute,
    adminRoute.addChildren([
      trainingPlanListRoute,
      trainingPlanDetailRoute,
      trainingPlanWorkoutRoute,
    ]),
  ]),
]);

export const router = createRouter({
  context: { queryClient },
  defaultPreload: 'intent',
  routeTree,
});

function parseMockAuthScenario(search: string): MockAuthScenario {
  const value = new URLSearchParams(search).get('mockAuth');
  const result = isMockAuthScenario(value) ? value : 'authenticated';

  return result;
}

function isMockAuthScenario(value: unknown): value is MockAuthScenario {
  const result =
    value === 'admin' ||
    value === 'authenticated' ||
    value === 'error' ||
    value === 'theme-dark' ||
    value === 'theme-light' ||
    value === 'theme-save-error' ||
    value === 'theme-save-error-unset' ||
    value === 'theme-unset' ||
    value === 'unauthenticated';

  return result;
}

function parseTrainingPlanSearch(
  search: Record<string, unknown>,
): TrainingPlanSearch {
  const mockAuth: MockAuthScenario | undefined = isMockAuthScenario(
    search.mockAuth,
  )
    ? search.mockAuth
    : undefined;
  const scenarios: readonly MockTrainingPlansScenario[] = [
    'create-error',
    'create-success',
    'create-workout-error',
    'delete-error',
    'delete-success',
    'delete-workout-error',
    'delete-workout-success',
    'detail-error',
    'empty',
    'list-error',
    'loading',
    'not-found',
    'success',
    'update-error',
    'update-success',
  ];
  const mockTrainingPlans = scenarios.find(
    (scenario) => scenario === search.mockTrainingPlans,
  );
  const result = {
    ...(mockAuth === undefined ? {} : { mockAuth }),
    ...(mockTrainingPlans === undefined ? {} : { mockTrainingPlans }),
  };

  return result;
}

// eslint-disable-next-line react-refresh/only-export-components
function TrainingPlanListRouteComponent() {
  const search = trainingPlanListRoute.useSearch();
  const result = (
    <TrainingPlanListPage
      mockAuth={search.mockAuth}
      mockTrainingPlans={search.mockTrainingPlans ?? 'success'}
      page={search.page ?? 1}
    />
  );

  return result;
}

// eslint-disable-next-line react-refresh/only-export-components
function TrainingPlanDetailRouteComponent() {
  const params = trainingPlanDetailRoute.useParams();
  const search = trainingPlanDetailRoute.useSearch();
  const result = (
    <TrainingPlanDetailPage
      mockAuth={search.mockAuth}
      mockTrainingPlans={search.mockTrainingPlans ?? 'success'}
      trainingPlanId={params.trainingPlanId}
    />
  );

  return result;
}

// eslint-disable-next-line react-refresh/only-export-components
function TrainingPlanWorkoutRouteComponent() {
  const params = trainingPlanWorkoutRoute.useParams();
  const search = trainingPlanWorkoutRoute.useSearch();
  const result = (
    <TrainingPlanWorkoutPage
      mockAuth={search.mockAuth}
      mockTrainingPlans={search.mockTrainingPlans ?? 'success'}
      trainingPlanId={params.trainingPlanId}
      workoutId={params.workoutId}
    />
  );

  return result;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
