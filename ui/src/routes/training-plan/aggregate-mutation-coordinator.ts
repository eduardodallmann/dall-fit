import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import axios from 'axios';

import type { VersionedMutationResult } from './training-plan-service';

interface AggregateMutationSnapshot {
  isPending: boolean;
  paused: boolean;
}

interface AggregateMutationState {
  chain: Promise<void>;
  listeners: Set<() => void>;
  paused: boolean;
  pendingCount: number;
  snapshot: AggregateMutationSnapshot;
  version: number;
}

const idleSnapshot: AggregateMutationSnapshot = {
  isPending: false,
  paused: false,
};

export function isTrainingPlanVersionConflict(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 412)
    return false;
  const data: unknown = error.response.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return false;
  return (
    (data as Record<string, unknown>).code === 'TRAINING_PLAN_VERSION_CONFLICT'
  );
}

export class AggregateMutationCoordinator {
  private readonly states = new Map<string, AggregateMutationState>();

  seed(trainingPlanId: string, version: number): void {
    const state = this.states.get(trainingPlanId);
    if (state === undefined) {
      this.states.set(trainingPlanId, this.createState(version));
      return;
    }

    if (state.pendingCount === 0 && !state.paused && version > state.version)
      state.version = version;
  }

  enqueue<T>(
    trainingPlanId: string,
    initialVersion: number,
    operation: (version: number) => Promise<VersionedMutationResult<T>>,
  ): Promise<T> {
    const state =
      this.states.get(trainingPlanId) ?? this.createState(initialVersion);
    this.states.set(trainingPlanId, state);
    if (state.paused)
      return Promise.reject(new Error('Aggregate mutation queue is paused.'));

    state.pendingCount += 1;
    this.publish(state);
    const task = state.chain.then(async () => {
      if (state.paused) throw new Error('Aggregate mutation queue is paused.');
      try {
        const result = await operation(state.version);
        state.version = result.version;
        return result.data;
      } catch (error) {
        if (isTrainingPlanVersionConflict(error)) {
          state.paused = true;
          this.publish(state);
        }
        throw error;
      }
    });
    state.chain = task.then(
      () => undefined,
      () => undefined,
    );
    const finish = () => {
      state.pendingCount = Math.max(0, state.pendingCount - 1);
      this.publish(state);
    };
    void task.then(finish, finish);
    return task;
  }

  async reset(trainingPlanId: string, version: number): Promise<void> {
    const state = this.states.get(trainingPlanId);
    if (state === undefined) {
      this.states.set(trainingPlanId, this.createState(version));
      return;
    }
    await state.chain;
    state.version = version;
    state.paused = false;
    this.publish(state);
  }

  snapshot(trainingPlanId: string | undefined): AggregateMutationSnapshot {
    if (trainingPlanId === undefined) return idleSnapshot;
    return this.states.get(trainingPlanId)?.snapshot ?? idleSnapshot;
  }

  subscribe(
    trainingPlanId: string | undefined,
    listener: () => void,
  ): () => void {
    if (trainingPlanId === undefined) return () => undefined;
    const state = this.states.get(trainingPlanId) ?? this.createState(0);
    this.states.set(trainingPlanId, state);
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }

  private createState(version: number): AggregateMutationState {
    return {
      chain: Promise.resolve(),
      listeners: new Set(),
      paused: false,
      pendingCount: 0,
      snapshot: idleSnapshot,
      version,
    };
  }

  private publish(state: AggregateMutationState): void {
    state.snapshot = {
      isPending: state.pendingCount > 0,
      paused: state.paused,
    };
    for (const listener of state.listeners) listener();
  }
}

const coordinators = new WeakMap<QueryClient, AggregateMutationCoordinator>();

export function getAggregateMutationCoordinator(
  queryClient: QueryClient,
): AggregateMutationCoordinator {
  const existing = coordinators.get(queryClient);
  if (existing !== undefined) return existing;
  const result = new AggregateMutationCoordinator();
  coordinators.set(queryClient, result);
  return result;
}

export function useAggregateMutationCoordinator(
  trainingPlanId: string | undefined,
  initialVersion: number | undefined,
) {
  const queryClient = useQueryClient();
  const coordinator = getAggregateMutationCoordinator(queryClient);
  useEffect(() => {
    if (trainingPlanId !== undefined && initialVersion !== undefined)
      coordinator.seed(trainingPlanId, initialVersion);
  }, [coordinator, initialVersion, trainingPlanId]);
  const subscribe = useCallback(
    (listener: () => void) => coordinator.subscribe(trainingPlanId, listener),
    [coordinator, trainingPlanId],
  );
  const getSnapshot = useCallback(
    () => coordinator.snapshot(trainingPlanId),
    [coordinator, trainingPlanId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const enqueue = useCallback(
    <T>(
      operation: (version: number) => Promise<VersionedMutationResult<T>>,
    ) => {
      if (trainingPlanId === undefined || initialVersion === undefined)
        return Promise.reject(
          new Error('Training plan version is unavailable.'),
        );
      return coordinator.enqueue(trainingPlanId, initialVersion, operation);
    },
    [coordinator, initialVersion, trainingPlanId],
  );
  const reset = useCallback(
    async (version: number) => {
      if (trainingPlanId !== undefined)
        await coordinator.reset(trainingPlanId, version);
    },
    [coordinator, trainingPlanId],
  );

  return { ...snapshot, enqueue, reset };
}
