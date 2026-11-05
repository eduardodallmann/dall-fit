import {
  Activity,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { useQuery } from '@tanstack/react-query';
import { useLocation, useRouter } from '@tanstack/react-router';

import type { Person } from '@dall-fit/types';

import type { MockAuthScenario } from '~/auth/auth-service';
import { getActiveSessionGeneration } from '~/auth/session-lifecycle';
import { AuthenticatedShell } from '~/core/components/authenticated-shell';
import { usePlatform } from '~/core/platform/platform';
import { realtimeClient } from '~/core/realtime/realtime-client';
import {
  getTermsPolicy,
  parseTermsReference,
  requireTerms,
  subscribeTermsPolicy,
} from '~/core/terms/policy';
import { termsAccessQueryOptions } from '~/core/terms/queries';
import { TermsPage } from '~/routes/terms';

export function TermsBoundary({
  person,
  mockAuth,
  children,
}: Readonly<{
  person: Person;
  mockAuth: MockAuthScenario;
  children: ReactNode;
}>) {
  const policy = useSyncExternalStore(subscribeTermsPolicy, getTermsPolicy);
  const { refetch } = useQuery(termsAccessQueryOptions());
  const location = useLocation();
  const router = useRouter();
  const platform = usePlatform();
  const mounted = policy.hasAccepted;
  const previousBlocked = useRef(policy.blocked);
  const legalRoute =
    location.pathname === '/terms' ||
    (location.pathname === '/admin/terms' &&
      person.isAdmin === true &&
      policy.access?.state === 'not-configured');

  useEffect(() => {
    if (previousBlocked.current !== policy.blocked) {
      previousBlocked.current = policy.blocked;
      if (getActiveSessionGeneration() !== undefined)
        void router.invalidate().catch(() => undefined);
    }
  }, [policy.blocked, router]);
  useEffect(() => {
    if (platform.platform !== 'web') return;
    const ready = realtimeClient.onReady(() => {
      void refetch();
    });
    const invalidation = realtimeClient.onInvalidation((event) => {
      if (event.resource !== 'terms') return;
      if (
        event.version >
        (getTermsPolicy().access?.current?.publicationNumber ?? 0)
      ) {
        requireTerms(
          parseTermsReference({
            id: event.resourceId,
            publicationNumber: event.version,
            contentHash:
              getTermsPolicy().access?.current?.contentHash ?? '0'.repeat(64),
          }),
        );
      }
      void refetch();
    });
    realtimeClient.start();
    return () => {
      ready();
      invalidation();
      realtimeClient.stop();
    };
  }, [platform.platform, refetch]);

  return (
    <AuthenticatedShell
      person={person}
      mockAuth={mockAuth}
      termsRestricted={policy.blocked}
      bypassNativeOfflineGuard={policy.blocked || legalRoute}
    >
      {policy.blocked && !legalRoute ? (
        <TermsPage isAdmin={person.isAdmin === true} />
      ) : null}
      {mounted || legalRoute ? (
        <Activity mode={policy.blocked && !legalRoute ? 'hidden' : 'visible'}>
          {children}
        </Activity>
      ) : null}
    </AuthenticatedShell>
  );
}
