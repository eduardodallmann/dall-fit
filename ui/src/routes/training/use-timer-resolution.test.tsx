import { StrictMode, type ReactNode } from 'react';

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrainingSession } from '@dall-fit/types';

import { activateSession, endSession } from '~/auth/session-lifecycle';
import { createTrainingSessionFixture } from '~/mocks/fixtures/training';
import { createHttpTrainingRepository } from '~/routes/training/http-training-repository';
import type { TrainingRepository } from '~/routes/training/training-repository';
import { useTimerResolution } from '~/routes/training/use-timer-resolution';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function harness() {
  const session = createTrainingSessionFixture('pause-running');
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const queryKey = ['training', 'timer-test'];
  queryClient.setQueryData(queryKey, session);
  const resolveTimer = vi
    .fn<TrainingRepository['resolveTimer']>()
    .mockResolvedValue({ ...session, activeTimer: null, version: 1 });
  const getSession = vi
    .fn<TrainingRepository['getSession']>()
    .mockResolvedValue(session);
  const repository = {
    ...createHttpTrainingRepository('pause-running'),
    source: 'native' as const,
    resolveTimer,
    getSession,
  };
  const onError = vi
    .fn<(error: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);
  const onSuccess = vi.fn((data: TrainingSession) =>
    queryClient.setQueryData(queryKey, data),
  );
  const preceding = deferred<void>();
  const write = vi.fn(() => preceding.promise);
  const view = renderHook(
    (current: TrainingSession) => {
      const load = useMutation({
        scope: { id: session.id },
        mutationFn: write,
      });
      const timer = useTimerResolution({
        onError,
        onSuccess,
        repository,
        session: current,
        sessionQueryKey: queryKey,
      });
      return { ...timer, load };
    },
    {
      initialProps: session,
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </StrictMode>
      ),
    },
  );
  return {
    ...view,
    onError,
    onSuccess,
    preceding,
    queryClient,
    queryKey,
    repository,
    getSession,
    resolveTimer,
    session,
    write,
  };
}

describe('timer resolution coordination', () => {
  beforeEach(async () => {
    await activateSession('person-timer', 'person');
  });

  it('refreshes the native clock anchor on resume without writing per tick', async () => {
    const h = harness();
    const restored = { ...h.session, serverNow: h.session.activeTimer!.endsAt };
    h.getSession.mockResolvedValue(restored);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() =>
      expect(h.queryClient.getQueryData(h.queryKey)).toEqual(restored),
    );
    expect(h.getSession).toHaveBeenCalledOnce();
    expect(h.resolveTimer).not.toHaveBeenCalled();
  });

  it('ignores a late native resume read after a newer session write', async () => {
    const h = harness();
    const pending = deferred<TrainingSession>();
    h.getSession.mockReturnValue(pending.promise);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(h.getSession).toHaveBeenCalledOnce());
    const newer = { ...h.session, version: 3, activeTimer: null };
    h.queryClient.setQueryData(h.queryKey, newer);
    await act(async () => {
      pending.resolve(h.session);
      await pending.promise;
    });
    expect(h.queryClient.getQueryData(h.queryKey)).toEqual(newer);
  });

  it('deduplicates manual and automatic attempts and waits for the authority', async () => {
    const h = harness();
    const pending = deferred<TrainingSession>();
    h.resolveTimer.mockReturnValue(pending.promise);
    act(() => {
      h.result.current.resolve('finish', true);
      h.result.current.resolve('skip');
      h.result.current.resolve('finish', true);
    });
    await waitFor(() => expect(h.result.current.isPending).toBe(true));
    expect(h.resolveTimer).toHaveBeenCalledExactlyOnceWith('finish', 0);
    expect(
      h.queryClient.getQueryData<TrainingSession>(h.queryKey)?.activeTimer,
    ).not.toBeNull();
    pending.resolve({ ...h.session, activeTimer: null, version: 1 });
    await waitFor(() => expect(h.result.current.isPending).toBe(false));
    expect(h.onSuccess).toHaveBeenCalledOnce();
    expect(
      h.queryClient.getQueryData<TrainingSession>(h.queryKey)?.activeTimer,
    ).toBeNull();
  });

  it('keeps failed expiration manual, allows retry and rearms a subsequent timer', async () => {
    const h = harness();
    h.resolveTimer.mockRejectedValueOnce(new Error('local commit failed'));
    act(() => h.result.current.resolve('finish', true));
    await waitFor(() => expect(h.result.current.error).toBe(true));
    act(() => h.result.current.resolve('finish', true));
    expect(h.resolveTimer).toHaveBeenCalledOnce();
    act(() => h.result.current.resolve('skip'));
    await waitFor(() => expect(h.onSuccess).toHaveBeenCalledOnce());
    const next = createTrainingSessionFixture(
      'pause-running',
      new Date(Date.now() + 60_000),
    );
    h.queryClient.setQueryData(h.queryKey, next);
    h.rerender(next);
    await waitFor(() => expect(h.result.current.isPending).toBe(false));
    act(() => h.result.current.resolve('finish', true));
    await waitFor(() => expect(h.resolveTimer).toHaveBeenCalledTimes(3));
  });

  it('waits behind another session write and reads its resulting version', async () => {
    const h = harness();
    act(() => h.result.current.load.mutate());
    await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
    act(() => h.result.current.resolve('finish', true));
    await waitFor(() => expect(h.result.current.isPending).toBe(true));
    expect(h.resolveTimer).not.toHaveBeenCalled();
    h.queryClient.setQueryData(h.queryKey, { ...h.session, version: 9 });
    h.preceding.resolve();
    await waitFor(() =>
      expect(h.resolveTimer).toHaveBeenCalledExactlyOnceWith('finish', 9),
    );
  });

  it.each(['timer', 'session', 'logout', 'unmount'] as const)(
    'discards a queued expiration after %s changes',
    async (change) => {
      const h = harness();
      act(() => h.result.current.load.mutate());
      await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
      act(() => h.result.current.resolve('finish', true));
      await waitFor(() => expect(h.result.current.isPending).toBe(true));
      if (change === 'timer')
        h.queryClient.setQueryData(
          h.queryKey,
          createTrainingSessionFixture('duration-running'),
        );
      if (change === 'session')
        h.queryClient.setQueryData(h.queryKey, {
          ...h.session,
          id: 'another-session',
        });
      if (change === 'logout') await endSession('logout');
      if (change === 'unmount') h.unmount();
      await act(async () => {
        h.preceding.resolve();
        await h.preceding.promise;
      });
      await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
      expect(h.resolveTimer).not.toHaveBeenCalled();
      expect(h.onSuccess).not.toHaveBeenCalled();
      expect(h.onError).not.toHaveBeenCalled();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores a late %s after authentication teardown',
    async (outcome) => {
      const h = harness();
      const pending = deferred<TrainingSession>();
      h.resolveTimer.mockReturnValue(pending.promise);
      act(() => h.result.current.resolve('finish', true));
      await waitFor(() => expect(h.resolveTimer).toHaveBeenCalledOnce());
      await endSession('logout');
      await activateSession('other-person', 'person');
      if (outcome === 'resolve')
        pending.resolve({ ...h.session, activeTimer: null });
      else pending.reject(new Error('late failure'));
      await waitFor(() => expect(h.result.current.isPending).toBe(false));
      expect(h.onSuccess).not.toHaveBeenCalled();
      expect(h.onError).not.toHaveBeenCalled();
      expect(h.result.current.error).toBe(false);
    },
  );

  it('does not replay expiration against the timer returned by reconciliation', async () => {
    const h = harness();
    const canonical = createTrainingSessionFixture(
      'pause-running',
      new Date(Date.now() + 60_000),
    );
    h.resolveTimer.mockRejectedValueOnce(new Error('conflict'));
    h.onError.mockImplementationOnce(async () => {
      h.queryClient.setQueryData(h.queryKey, canonical);
      await Promise.resolve();
    });
    act(() => h.result.current.resolve('finish', true));
    await waitFor(() => expect(h.result.current.isPending).toBe(false));
    h.rerender(canonical);
    act(() => h.result.current.resolve('finish', true));
    expect(h.resolveTimer).toHaveBeenCalledOnce();
    act(() => h.result.current.resolve('skip'));
    await waitFor(() => expect(h.resolveTimer).toHaveBeenCalledTimes(2));
  });
});
