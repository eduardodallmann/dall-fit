import { useCallback, useEffect, useRef } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { TrainingSession } from '@dall-fit/types';

import {
  getActiveSessionGeneration,
  isSessionGenerationActive,
} from '~/auth/session-lifecycle';
import { trackTrainingAction } from '~/core/analytics';
import type { TrainingRepository } from '~/routes/training/training-repository';

interface TimerResolution {
  generation: number;
  outcome: 'cancel' | 'finish' | 'skip';
  timerKey: string;
}

interface TimerResolutionOptions {
  onError: (error: unknown) => Promise<void>;
  onSuccess: (data: TrainingSession) => void;
  repository: TrainingRepository;
  session: TrainingSession;
  sessionQueryKey: readonly unknown[];
}

function timerKey(session: TrainingSession): string {
  const timer = session.activeTimer;
  return JSON.stringify([
    session.id,
    timer?.kind,
    timer?.exerciseId,
    timer?.seriesNumber,
    timer?.startedAt,
    timer?.endsAt,
  ]);
}

export function useTimerResolution({
  onError,
  onSuccess,
  repository,
  session,
  sessionQueryKey,
}: TimerResolutionOptions) {
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const attempted = useRef(new Set<string>());
  const key = timerKey(session);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (repository.source !== 'native') return;
    const resume = async () => {
      if (document.visibilityState !== 'visible') return;
      const generation = getActiveSessionGeneration();
      const before = queryClient.getQueryData<TrainingSession>(sessionQueryKey);
      if (before?.activeTimer == null) return;
      try {
        // Refresh the existing native clock anchor after device suspension.
        const restored = await repository.getSession();
        const current =
          queryClient.getQueryData<TrainingSession>(sessionQueryKey);
        if (
          mounted.current &&
          isSessionGenerationActive(generation) &&
          current !== undefined &&
          timerKey(current) === timerKey(before) &&
          restored.id === current.id &&
          restored.version >= current.version
        )
          queryClient.setQueryData(sessionQueryKey, restored);
      } catch {
        // A failed read preserves the last confirmed session and clock.
      }
    };
    const handleVisibility = () => {
      void resume();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [queryClient, repository, sessionQueryKey]);

  const currentSession = (input: TimerResolution) => {
    const current = queryClient.getQueryData<TrainingSession>(sessionQueryKey);
    if (
      !mounted.current ||
      !isSessionGenerationActive(input.generation) ||
      current?.activeTimer == null ||
      timerKey(current) !== input.timerKey
    )
      return undefined;
    return current;
  };
  const mutation = useMutation({
    mutationKey: ['training-session-write', session.id],
    scope: { id: session.id },
    retry: false,
    mutationFn: async (input: TimerResolution) => {
      const current = currentSession(input);
      if (current === undefined)
        throw new DOMException('Timer resolution superseded.', 'AbortError');
      return repository.resolveTimer(input.outcome, current.version);
    },
    onSuccess: (data, input) => {
      if (currentSession(input) === undefined) return;
      trackTrainingAction('training_workout', 'resolve_timer', 'success');
      onSuccess(data);
    },
    onError: async (error, input) => {
      if (currentSession(input) === undefined) return;
      trackTrainingAction('training_workout', 'resolve_timer', 'error');
      await onError(error);
      // Reconciliation may return another timer. It requires a fresh explicit
      // action instead of replaying the expiration that just conflicted.
      const canonical =
        queryClient.getQueryData<TrainingSession>(sessionQueryKey);
      if (canonical !== undefined) attempted.current.add(timerKey(canonical));
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const { mutate } = mutation;
  const resolve = useCallback(
    (outcome: TimerResolution['outcome'], automatic = false) => {
      const generation = getActiveSessionGeneration();
      if (
        !mounted.current ||
        generation === undefined ||
        inFlight.current ||
        (automatic && attempted.current.has(key))
      )
        return;
      attempted.current.add(key);
      inFlight.current = true;
      mutate({ generation, outcome, timerKey: key });
    },
    [key, mutate],
  );

  return {
    error:
      mutation.isError &&
      mutation.variables.timerKey === key &&
      isSessionGenerationActive(mutation.variables.generation) &&
      !(
        mutation.error instanceof DOMException &&
        mutation.error.name === 'AbortError'
      ),
    isPending: mutation.isPending,
    resolve,
    timerKey: key,
  };
}
