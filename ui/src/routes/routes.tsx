import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import axios from 'axios';

import { configureAdminAccessHandler } from '~/auth/admin-access-lifecycle';
import { ensureCsrfToken, type MockAuthScenario } from '~/auth/auth-service';
import { clearCsrfToken } from '~/auth/csrf-token';
import { currentPersonQueryOptions } from '~/auth/current-person-query';
import {
  activateSession,
  armSessionReturnBypass,
  configureSessionEndHandler,
  consumeSessionReturnBypass,
  endSession,
  getActiveSessionMockAuth,
} from '~/auth/session-lifecycle';
import { queryClient } from '~/context/query-client';
import {
  ProtectedRouteError,
  ProtectedRoutePending,
} from '~/core/components/route-status';
import { assertAdminAccess } from '~/routes/admin-access';
import { probeRootSession } from '~/routes/root-session-probe';
import {
  AuthenticatedRouteComponent,
  DashRouteComponent,
  HomeRouteComponent,
  HomeRoutePending,
} from '~/routes/route-components';
import { TrainingPlanDetailPage } from '~/routes/training-plan/detail-page';
import { TrainingPlanListPage } from '~/routes/training-plan/list-page';
import { PersonalTrainingPlanDetailPage } from '~/routes/training-plan/personal-detail-page';
import { PersonalTrainingPlanListPage } from '~/routes/training-plan/personal-list-page';
import { PersonalTrainingPlanWorkoutPage } from '~/routes/training-plan/personal-workout-page';
import { canonicalTrainingPlanPage } from '~/routes/training-plan/training-plan-pagination';
import type { MockTrainingPlansScenario } from '~/routes/training-plan/training-plan-service';
import { TrainingPlanWorkoutPage } from '~/routes/training-plan/workout-page';

interface RouterContext {
  queryClient: QueryClient;
}

interface HomeSearch {
  authError?: 'oauth_failed';
  mockAuth?: MockAuthScenario;
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
  beforeLoad: async ({ abortController, context, preload, search }) => {
    if (preload || consumeSessionReturnBypass()) return;
    const scenario = search.mockAuth ?? 'authenticated';
    const decision = await probeRootSession({
      mockAuth: scenario,
      queryClient: context.queryClient,
    });
    if (decision === 'replace-with-dash' && !abortController.signal.aborted)
      redirect({
        replace: true,
        search:
          search.mockAuth === undefined ? {} : { mockAuth: search.mockAuth },
        throw: true,
        to: '/dash',
      });
  },
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const result: HomeSearch = {};
    if (search.authError === 'oauth_failed')
      result.authError = 'oauth_failed' as const;
    const mockAuth: MockAuthScenario | undefined = isMockAuthScenario(
      search.mockAuth,
    )
      ? search.mockAuth
      : undefined;
    if (mockAuth !== undefined) result.mockAuth = mockAuth;

    return result;
  },
  component: HomeRouteComponent,
  pendingComponent: HomeRoutePending,
  pendingMs: 300,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated',
  beforeLoad: async ({ context, location }) => {
    const mockAuth = parseMockAuthScenario(location.searchStr);

    try {
      const person = await context.queryClient.fetchQuery(
        currentPersonQueryOptions(mockAuth),
      );
      await activateSession(person.id, mockAuth);
      context.queryClient.setQueryData(
        currentPersonQueryOptions(mockAuth).queryKey,
        person,
      );
      await ensureCsrfToken(mockAuth);
      const result = { mockAuth, person };

      return result;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await endSession('expired');
        armSessionReturnBypass();
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
  component: AdminRouteComponent,
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
  beforeLoad: ({ location }) => {
    const rawSearch = new URLSearchParams(location.searchStr);
    const canonicalPage = canonicalTrainingPlanPage(rawSearch.get('page'));
    if (!canonicalPage.shouldReplace) return;

    const common = parseTrainingPlanSearch(
      Object.fromEntries(rawSearch.entries()),
    );
    redirect({
      replace: true,
      search: common,
      throw: true,
      to: '/global/training-plan',
    });
  },
  validateSearch: (search: Record<string, unknown>): TrainingPlanListSearch => {
    const common = parseTrainingPlanSearch(search);
    const numericPage = Number(search.page);
    const page =
      Number.isInteger(numericPage) && numericPage > 1 && numericPage <= 100
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

const personalTrainingPlanListRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/training-plan',
  validateSearch: (search: Record<string, unknown>): TrainingPlanListSearch => {
    const common = parseTrainingPlanSearch(search);
    const numericPage = Number(search.page);
    const page =
      Number.isInteger(numericPage) && numericPage > 1 && numericPage <= 100
        ? numericPage
        : undefined;
    return page === undefined ? common : { ...common, page };
  },
  component: PersonalTrainingPlanListRouteComponent,
});

const personalTrainingPlanDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/training-plan/$catalogEntryId',
  validateSearch: parseTrainingPlanSearch,
  component: PersonalTrainingPlanDetailRouteComponent,
});

const personalTrainingPlanWorkoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/training-plan/$catalogEntryId/workout/$workoutId',
  validateSearch: parseTrainingPlanSearch,
  component: PersonalTrainingPlanWorkoutRouteComponent,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  authenticatedRoute.addChildren([
    dashRoute,
    personalTrainingPlanListRoute,
    personalTrainingPlanDetailRoute,
    personalTrainingPlanWorkoutRoute,
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

configureSessionEndHandler(async (reason, generation) => {
  clearCsrfToken();
  if (generation === undefined) return;
  await queryClient.cancelQueries(undefined, { silent: true });
  queryClient.clear();
  if (reason !== 'identity_changed')
    await router.navigate({ replace: true, to: '/' });
});

configureAdminAccessHandler(async () => {
  const mockAuth = (getActiveSessionMockAuth() ??
    'authenticated') as MockAuthScenario;
  const person = await queryClient.fetchQuery({
    ...currentPersonQueryOptions(mockAuth),
    staleTime: 0,
  });
  await router.invalidate({ sync: true });
  if (person.isAdmin !== true)
    await router.navigate({ replace: true, to: '/dash' });
});

function parseMockAuthScenario(search: string): MockAuthScenario {
  const value = new URLSearchParams(search).get('mockAuth');
  const result = isMockAuthScenario(value) ? value : 'authenticated';

  return result;
}

function isMockAuthScenario(value: unknown): value is MockAuthScenario {
  const result =
    value === 'admin' ||
    value === 'admin-revoked' ||
    value === 'authenticated' ||
    value === 'csrf-refresh' ||
    value === 'csrf-error' ||
    value === 'error' ||
    value === 'logout-error' ||
    value === 'person' ||
    value === 'theme-dark' ||
    value === 'theme-light' ||
    value === 'theme-save-error' ||
    value === 'theme-save-error-unset' ||
    value === 'theme-unset' ||
    value === 'session-expired' ||
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
    'empty-workout',
    'list-error',
    'large-pagination',
    'loading',
    'not-found',
    'personal-mixed',
    'personal-reference',
    'clone-running',
    'clone-failed',
    'usage-counts',
    'success',
    'update-error',
    'update-success',
    'update-exercise-error',
    'delete-exercise-error',
    'image-error',
    'image-signed-url-expired',
    'reorder-error',
    'csrf-refresh',
    'timeout',
    'two-pages',
    'version-conflict',
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
function AdminRouteComponent() {
  authenticatedRoute.useRouteContext();
  return <Outlet />;
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

// eslint-disable-next-line react-refresh/only-export-components
function PersonalTrainingPlanListRouteComponent() {
  const search = personalTrainingPlanListRoute.useSearch();
  return (
    <PersonalTrainingPlanListPage
      mockAuth={search.mockAuth}
      mockTrainingPlans={search.mockTrainingPlans ?? 'success'}
      page={search.page ?? 1}
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function PersonalTrainingPlanDetailRouteComponent() {
  const params = personalTrainingPlanDetailRoute.useParams();
  const search = personalTrainingPlanDetailRoute.useSearch();
  return (
    <PersonalTrainingPlanDetailPage
      catalogEntryId={params.catalogEntryId}
      mockAuth={search.mockAuth}
      mockTrainingPlans={search.mockTrainingPlans ?? 'success'}
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function PersonalTrainingPlanWorkoutRouteComponent() {
  const params = personalTrainingPlanWorkoutRoute.useParams();
  const search = personalTrainingPlanWorkoutRoute.useSearch();
  return (
    <PersonalTrainingPlanWorkoutPage
      catalogEntryId={params.catalogEntryId}
      mockAuth={search.mockAuth}
      mockTrainingPlans={search.mockTrainingPlans ?? 'success'}
      workoutId={params.workoutId}
    />
  );
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
