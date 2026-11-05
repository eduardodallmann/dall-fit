import { useEffect, useLayoutEffect } from 'react';

import { Card, Skeleton } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import {
  Outlet,
  useNavigate,
  useRouteContext,
  useRouter,
  useSearch,
} from '@tanstack/react-router';

import { currentPersonQueryOptions } from '~/auth/current-person-query';
import { endSession } from '~/auth/session-lifecycle';
import { usePlatform } from '~/core/platform/platform';
import { useTheme } from '~/core/theme/theme-context';
import { DashboardPage } from '~/routes/dashboard';
import { HomePage } from '~/routes/home';
import { homeStyles } from '~/routes/home/styles';
import { TermsBoundary } from '~/routes/terms/boundary';
import { TrainingPlanRealtimeBridge } from '~/routes/training-plan/realtime-bridge';

export function AuthenticatedRouteComponent() {
  const { mockAuth, person: routePerson } = useRouteContext({
    from: '/_authenticated',
  });
  const personQuery = useQuery(currentPersonQueryOptions(mockAuth));
  const router = useRouter();
  const { reconcileAuthenticated } = useTheme();
  const person = personQuery.data;
  const platform = usePlatform();

  useLayoutEffect(() => {
    if (person?.id === routePerson.id) reconcileAuthenticated(person, mockAuth);
  }, [mockAuth, person, reconcileAuthenticated, routePerson.id]);

  useEffect(() => {
    if (person === undefined) return;
    if (person.id !== routePerson.id) {
      endSession('identity_changed').catch(() => undefined);
      return;
    }
    if (routePerson.isAdmin === true && person.isAdmin !== true) {
      router
        .invalidate({ sync: true })
        .then(() => router.navigate({ replace: true, to: '/dash' }))
        .catch(() => undefined);
    }
  }, [person, routePerson.id, routePerson.isAdmin, router]);

  if (person === undefined || person.id !== routePerson.id) return null;

  const result = (
    <TermsBoundary mockAuth={mockAuth} person={person}>
      {platform.platform === 'web' ? <TrainingPlanRealtimeBridge /> : null}
      <Outlet />
    </TermsBoundary>
  );

  return result;
}

const homePageStyles = homeStyles();

export function HomeRouteComponent() {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate();
  const { reconcilePublic } = useTheme();

  useLayoutEffect(() => {
    reconcilePublic();
  }, [reconcilePublic]);

  const result = (
    <HomePage
      hasAuthError={search.authError === 'oauth_failed'}
      onNativeAuthenticated={() => navigate({ replace: true, to: '/dash' })}
    />
  );

  return result;
}

export function HomeRoutePending() {
  const result = (
    <main className={homePageStyles.page()}>
      <div
        aria-label="Verificando sua sessão"
        className={homePageStyles.pageContent()}
        role="status"
      >
        <Card>
          <Card.Header>
            <div className="flex flex-col gap-3">
              <Skeleton className={homePageStyles.skeletonEyebrow()} />
              <Skeleton className={homePageStyles.skeletonTitle()} />
              <Skeleton className={homePageStyles.skeletonDescription()} />
            </div>
          </Card.Header>
          <Card.Footer>
            <Skeleton className={homePageStyles.skeletonButton()} />
          </Card.Footer>
        </Card>
      </div>
    </main>
  );

  return result;
}

export function DashRouteComponent() {
  const { person } = useRouteContext({ from: '/_authenticated' });
  const search = useSearch({ from: '/_authenticated/dash' });
  const scenario =
    search.mockDashboard ?? (person.isAdmin === true ? 'admin' : 'personal');
  const result = (
    <DashboardPage isAdmin={person.isAdmin === true} scenario={scenario} />
  );

  return result;
}
