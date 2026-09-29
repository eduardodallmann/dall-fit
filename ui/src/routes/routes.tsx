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
import { authReturnTo, parseAuthReturnUrl } from '~/auth/auth-return-to';
import { ensureCsrfToken, type MockAuthScenario } from '~/auth/auth-service';
import { clearCsrfToken } from '~/auth/csrf-token';
import { currentPersonQueryOptions } from '~/auth/current-person-query';
import { getSessionChannel } from '~/auth/session-channel';
import {
  activateSession,
  armSessionReturnBypass,
  configureSessionEndHandler,
  consumeSessionReturnBypass,
  endSession,
  getActiveSessionMockAuth,
  getActiveSessionSignal,
} from '~/auth/session-lifecycle';
import { queryClient } from '~/context/query-client';
import {
  ProtectedRouteError,
  ProtectedRoutePending,
} from '~/core/components/route-status';
import { assertAdminAccess } from '~/routes/admin-access';
import type { MockDashboardScenario } from '~/routes/dashboard/dashboard-service';
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
import { TrainingCompletionPage } from '~/routes/training/completion-page';
import { TrainingOverviewPage } from '~/routes/training/overview-page';
import type { MockTrainingScenario } from '~/routes/training/training-service';
import { TrainingWorkoutPage } from '~/routes/training/workout-page';

interface RouterContext {
  queryClient: QueryClient;
}

interface HomeSearch {
  authError?: 'oauth_failed';
  mockAuth?: MockAuthScenario;
}

interface DashSearch {
  mockAuth?: MockAuthScenario;
  mockDashboard?: MockDashboardScenario;
}

interface TrainingPlanSearch extends DashSearch {
  mockTrainingPlans?: MockTrainingPlansScenario;
}

interface TrainingPlanListSearch extends TrainingPlanSearch {
  page?: number;
}

interface TrainingSearch extends DashSearch {
  mockTraining?: MockTrainingScenario;
}

let navigationSequence = 0;
let navigationHref: string | undefined;
let pendingAuthentication:
  { href: string; isCurrent: () => boolean } | undefined;

const rootRoute = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ preload, location }) => {
    if (!preload && location.href !== navigationHref) {
      navigationSequence += 1;
      navigationHref = location.href;
      pendingAuthentication = undefined;
    }
    return { navigationSequence };
  },
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
    if (
      decision === 'replace-with-dash' &&
      !abortController.signal.aborted &&
      context.navigationSequence === navigationSequence
    ) {
      const destination = authReturnTo.consume(normalizeAuthReturnTo);
      if (destination !== undefined)
        redirect({ href: destination, replace: true, throw: true });
      redirect({
        replace: true,
        search:
          search.mockAuth === undefined ? {} : { mockAuth: search.mockAuth },
        throw: true,
        to: '/dash',
      });
    }
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
  beforeLoad: async ({ abortController, context, location, preload }) => {
    const mockAuth = parseMockAuthScenario(location.searchStr);
    const options = currentPersonQueryOptions(mockAuth);
    if (preload) {
      const person = context.queryClient.getQueryData(options.queryKey);
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router uses redirects to stop preloading.
      if (person === undefined) throw redirect({ to: '/' });
      return { mockAuth, person };
    }
    const isCurrent = () =>
      !abortController.signal.aborted &&
      context.navigationSequence === navigationSequence;
    const attempt = { href: location.href, isCurrent };
    // A revalidation of the mounted screen remains a terminal expiry, not a new intent.
    if (location.href !== router.state.resolvedLocation?.href)
      pendingAuthentication = attempt;

    try {
      const person = await context.queryClient.fetchQuery(options);
      assertCurrentNavigation(isCurrent);
      await activateSession(person.id, mockAuth);
      assertCurrentNavigation(isCurrent);
      context.queryClient.setQueryData(
        currentPersonQueryOptions(mockAuth).queryKey,
        person,
      );
      if (getSessionChannel() === 'web') await ensureCsrfToken(mockAuth);
      assertCurrentNavigation(isCurrent);
      finishAuthenticatedNavigation(location);
      const result = { mockAuth, person };

      return result;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        isCurrent()
      ) {
        await endSession('expired');
        if (!isCurrent()) throw error;
        if (pendingAuthentication === attempt)
          captureAuthReturnTo(location.href);
        armSessionReturnBypass();
        redirect({ replace: true, throw: true, to: '/' });
      }

      throw error;
    } finally {
      releaseAuthenticationAttempt(attempt);
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
    const mockDashboard = isMockDashboardScenario(search.mockDashboard)
      ? search.mockDashboard
      : undefined;
    const result = {
      ...(mockAuth === undefined ? {} : { mockAuth }),
      ...(mockDashboard === undefined ? {} : { mockDashboard }),
    };

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

const trainingOverviewRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/training',
  validateSearch: parseTrainingSearch,
  component: TrainingOverviewRouteComponent,
});

const trainingWorkoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/training/workout/$workoutId',
  validateSearch: parseTrainingSearch,
  component: TrainingWorkoutRouteComponent,
});

const trainingCompletionRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/training/completion/$workoutExecutionId',
  validateSearch: parseTrainingSearch,
  component: TrainingCompletionRouteComponent,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  authenticatedRoute.addChildren([
    dashRoute,
    personalTrainingPlanListRoute,
    personalTrainingPlanDetailRoute,
    personalTrainingPlanWorkoutRoute,
    trainingOverviewRoute,
    trainingWorkoutRoute,
    trainingCompletionRoute,
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
  const attempt = pendingAuthentication;
  if (reason !== 'expired' || generation !== undefined) authReturnTo.clear();
  if (generation === undefined) return;
  await queryClient.cancelQueries(undefined, { silent: true });
  queryClient.clear();
  if (reason === 'expired' && attempt?.isCurrent())
    captureAuthReturnTo(attempt.href);
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

function releaseAuthenticationAttempt(attempt: {
  href: string;
  isCurrent: () => boolean;
}): void {
  // Teardown aborts the query before its terminal handler reads this intent.
  if (pendingAuthentication === attempt && !getActiveSessionSignal()?.aborted)
    pendingAuthentication = undefined;
}

function assertCurrentNavigation(isCurrent: () => boolean): void {
  if (!isCurrent())
    throw new DOMException('Navigation cancelled.', 'AbortError');
}

function normalizeAuthReturnTo(href: string): string | undefined {
  const url = parseAuthReturnUrl(href);
  if (url === undefined) return undefined;
  const { foundRoute, matchedRoutes, routeParams } = router.getMatchedRoutes(
    url.pathname,
  );
  if (
    foundRoute === undefined ||
    routeParams['**'] !== undefined ||
    !matchedRoutes.some((route) => route.id === authenticatedRoute.id)
  )
    return undefined;
  if (
    foundRoute.id === trainingPlanListRoute.id &&
    canonicalTrainingPlanPage(url.searchParams.get('page')).shouldReplace
  )
    url.searchParams.delete('page');
  return validatedReturnHref(url, matchedRoutes);
}

function validatedReturnHref(
  url: URL,
  routes: readonly { options: { validateSearch?: unknown } }[],
): string {
  const rawSearch = Object.fromEntries(url.searchParams.entries());
  const search: Record<string, unknown> = {};
  for (const route of routes) {
    const validate = route.options.validateSearch;
    if (typeof validate !== 'function') continue;
    const validated: unknown = (
      validate as (input: Record<string, unknown>) => unknown
    )(rawSearch);
    if (typeof validated === 'object' && validated !== null)
      Object.assign(search, validated);
  }
  url.search = '';
  for (const [key, value] of Object.entries(search)) {
    if (!isReturnSearchValue(key, value)) continue;
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function isReturnSearchValue(key: string, value: unknown): boolean {
  if (key === 'mockAuth') return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return (
    !key.startsWith('mock') ||
    (import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true')
  );
}

function finishAuthenticatedNavigation(location: {
  pathname: string;
  href: string;
}): void {
  if (location.pathname !== '/dash') {
    authReturnTo.clear();
    return;
  }
  const destination = authReturnTo.consume(normalizeAuthReturnTo);
  if (destination !== undefined && destination !== location.href)
    redirect({ href: destination, replace: true, throw: true });
}

function captureAuthReturnTo(href: string): void {
  // A failed callback bootstrap must not replace the original intent with /dash.
  if (
    parseAuthReturnUrl(href)?.pathname === '/dash' &&
    authReturnTo.read(normalizeAuthReturnTo) !== undefined
  )
    return;
  authReturnTo.save(href, normalizeAuthReturnTo);
}

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

function isMockDashboardScenario(
  value: unknown,
): value is MockDashboardScenario {
  const result = [
    'admin',
    'admin-error',
    'empty',
    'personal',
    'personal-error',
    'session-running',
  ].includes(String(value));
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
    'assistant-abandon',
    'assistant-blocked',
    'assistant-clarifying',
    'assistant-collecting',
    'assistant-emergency',
    'assistant-health-clarification',
    'assistant-multiple-answers',
    'assistant-neutral-screening',
    'assistant-preview',
    'assistant-provider-error',
    'assistant-version-conflict',
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
    'library-empty',
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

function parseTrainingSearch(search: Record<string, unknown>): TrainingSearch {
  const mockAuth: MockAuthScenario | undefined = isMockAuthScenario(
    search.mockAuth,
  )
    ? search.mockAuth
    : undefined;
  const scenarios: readonly MockTrainingScenario[] = [
    'active-plan',
    'duration-running',
    'exercise-completed',
    'load-pending',
    'no-active-plan',
    'pause-running',
    'series-running',
    'session-expired',
    'session-running',
    'workout-complete',
    'workout-incomplete',
    'workout-preview',
    'youtube-long-running',
  ];
  const mockTraining = scenarios.find(
    (scenario) => scenario === search.mockTraining,
  );
  const result = {
    ...(mockAuth === undefined ? {} : { mockAuth }),
    ...(mockTraining === undefined ? {} : { mockTraining }),
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

// eslint-disable-next-line react-refresh/only-export-components
function TrainingOverviewRouteComponent() {
  const search = trainingOverviewRoute.useSearch();
  return (
    <TrainingOverviewPage mockTraining={search.mockTraining ?? 'active-plan'} />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function TrainingWorkoutRouteComponent() {
  const params = trainingWorkoutRoute.useParams();
  const search = trainingWorkoutRoute.useSearch();
  return (
    <TrainingWorkoutPage
      mockTraining={search.mockTraining ?? 'workout-preview'}
      workoutId={params.workoutId}
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function TrainingCompletionRouteComponent() {
  const params = trainingCompletionRoute.useParams();
  const search = trainingCompletionRoute.useSearch();
  return (
    <TrainingCompletionPage
      mockTraining={search.mockTraining ?? 'workout-complete'}
      workoutExecutionId={params.workoutExecutionId}
    />
  );
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
