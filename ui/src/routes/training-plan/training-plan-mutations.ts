import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import type {
  CreateTrainingPlanRequest,
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutSummary,
  UpdateTrainingPlanRequest,
} from '@dall-fit/types';

import {
  getAggregateMutationCoordinator,
  isTrainingPlanVersionConflict,
} from './aggregate-mutation-coordinator';
import { trainingPlanKeys } from './training-plan-queries';
import {
  createGlobalTrainingPlan,
  createTrainingPlanWorkout,
  deleteGlobalTrainingPlan,
  deleteTrainingPlanWorkout,
  updateGlobalTrainingPlan,
  type MockTrainingPlansScenario,
} from './training-plan-service';

const optimisticTokens = '__dallFitOptimisticTokens';
const optimisticPlanToken = '__dallFitOptimisticMutation';

type InternalCollectionResponse = GlobalTrainingPlanCollectionResponse & {
  [optimisticTokens]?: readonly string[];
};

type InternalTrainingPlanSummary = TrainingPlanSummary & {
  [optimisticPlanToken]?: string;
};

type InternalTrainingPlanDetails = TrainingPlanDetails & {
  [optimisticPlanToken]?: string;
};

interface OptimisticPlanEntry {
  previous: TrainingPlanSummary;
  queryKey: QueryKey;
  token: string;
}

interface OptimisticDetailEntry {
  previous: TrainingPlanDetails;
  queryKey: QueryKey;
  token: string;
}

interface RemovedWorkoutEntry {
  previousIndex: number;
  previousWorkout: TrainingPlanWorkoutSummary;
  queryKey: QueryKey;
}

interface RemovedPlanEntry {
  previousIndex: number;
  previousPlan?: TrainingPlanSummary;
  queryKey: QueryKey;
}

function createTemporaryPlan(input: CreateTrainingPlanRequest) {
  const now = new Date().toISOString();
  const result: TrainingPlanSummary = {
    id: `temporary-${crypto.randomUUID()}`,
    name: input.name.trim(),
    description: input.description.trim(),
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  return result;
}

function addOptimisticDelta(
  cached: GlobalTrainingPlanCollectionResponse,
  token: string,
  delta: number,
): InternalCollectionResponse {
  const currentTokens =
    (cached as InternalCollectionResponse)[optimisticTokens] ?? [];
  const tokens = currentTokens.includes(token)
    ? currentTokens
    : [...currentTokens, token];
  return {
    ...cached,
    [optimisticTokens]: tokens,
    total: Math.max(0, cached.total + delta),
  };
}

function settleOptimisticDelta(
  cached: GlobalTrainingPlanCollectionResponse,
  token: string,
  rollbackDelta: number,
): InternalCollectionResponse {
  const current = cached as InternalCollectionResponse;
  const tokens = current[optimisticTokens];
  if (tokens === undefined || !tokens.includes(token)) return current;
  const nextTokens = tokens.filter((currentToken) => currentToken !== token);
  return {
    ...current,
    [optimisticTokens]: nextTokens,
    total: Math.max(0, current.total + rollbackDelta),
  };
}

function insertAtPreviousPosition<T extends { id: string }>(
  current: readonly T[],
  target: T,
  previousIndex: number,
): readonly T[] {
  if (current.some((item) => item.id === target.id)) return current;
  const index = Math.min(previousIndex, current.length);
  return [...current.slice(0, index), target, ...current.slice(index)];
}

function detailMatchesTrainingPlan(
  queryKey: QueryKey,
  trainingPlanId: string,
): boolean {
  return (
    queryKey[0] === 'training-plans' &&
    queryKey[1] === 'detail' &&
    queryKey[2] === trainingPlanId
  );
}

async function cancelTrainingPlanQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  trainingPlanId: string,
): Promise<void> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: trainingPlanKeys.lists() }),
    queryClient.cancelQueries({
      predicate: (query) =>
        detailMatchesTrainingPlan(query.queryKey, trainingPlanId),
    }),
  ]);
}

async function invalidateTrainingPlanQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  trainingPlanId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: trainingPlanKeys.lists() }),
    queryClient.invalidateQueries({
      predicate: (query) =>
        detailMatchesTrainingPlan(query.queryKey, trainingPlanId),
    }),
  ]);
}

export function useCreateTrainingPlanMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const result = useMutation({
    mutationFn: (input: CreateTrainingPlanRequest) =>
      createGlobalTrainingPlan(input, scenario),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: trainingPlanKeys.lists() });
      const temporary = createTemporaryPlan(input);
      const token = `create-${crypto.randomUUID()}`;
      const queryKeys = queryClient
        .getQueriesData<GlobalTrainingPlanCollectionResponse>({
          queryKey: trainingPlanKeys.lists(),
        })
        .filter(
          (entry): entry is [QueryKey, GlobalTrainingPlanCollectionResponse] =>
            entry[1] !== undefined,
        )
        .map(([queryKey]) => queryKey);

      for (const queryKey of queryKeys) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          queryKey,
          (cached) => {
            if (cached === undefined) return cached;
            const withDelta = addOptimisticDelta(cached, token, 1);
            return cached.page === 1
              ? {
                  ...withDelta,
                  data: [temporary, ...cached.data].slice(0, cached.pageSize),
                }
              : withDelta;
          },
        );
      }
      return { queryKeys, temporaryId: temporary.id, token };
    },
    onError: (_error, _input, context) => {
      if (context === undefined) return;
      for (const queryKey of context.queryKeys) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          queryKey,
          (cached) => {
            if (cached === undefined) return cached;
            const settled = settleOptimisticDelta(cached, context.token, -1);
            return {
              ...settled,
              data: settled.data.filter(
                (plan) => plan.id !== context.temporaryId,
              ),
            };
          },
        );
      }
    },
    onSuccess: (created, _input, context) => {
      if (context === undefined) return;
      for (const queryKey of context.queryKeys) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          queryKey,
          (cached) => {
            if (cached === undefined) return cached;
            const settled = settleOptimisticDelta(cached, context.token, 0);
            return {
              ...settled,
              data: settled.data.map((plan) =>
                plan.id === context.temporaryId ? created : plan,
              ),
            };
          },
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.lists(),
      });
    },
  });

  return result;
}

export function useUpdateTrainingPlanMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const coordinator = getAggregateMutationCoordinator(queryClient);
  const result = useMutation({
    mutationFn: async ({
      changes,
      version,
      trainingPlanId,
    }: {
      changes: UpdateTrainingPlanRequest;
      version: number;
      trainingPlanId: string;
    }) =>
      coordinator.enqueue(trainingPlanId, version, async (currentVersion) => {
        await cancelTrainingPlanQueries(queryClient, trainingPlanId);
        const updatedAt = new Date().toISOString();
        const token = `update-${crypto.randomUUID()}`;
        const lists: OptimisticPlanEntry[] = [];
        const details: OptimisticDetailEntry[] = [];

        for (const [
          queryKey,
          cached,
        ] of queryClient.getQueriesData<GlobalTrainingPlanCollectionResponse>({
          queryKey: trainingPlanKeys.lists(),
        })) {
          const previous = cached?.data.find(
            (plan) => plan.id === trainingPlanId,
          );
          if (previous === undefined) continue;
          const optimistic: InternalTrainingPlanSummary = {
            ...previous,
            ...changes,
            [optimisticPlanToken]: token,
            updatedAt,
          };
          lists.push({ previous, queryKey, token });
          queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
            queryKey,
            (current) =>
              current === undefined
                ? current
                : {
                    ...current,
                    data: current.data.map((plan) =>
                      plan === previous ? optimistic : plan,
                    ),
                  },
          );
        }
        for (const [
          queryKey,
          cached,
        ] of queryClient.getQueriesData<TrainingPlanDetails>({
          queryKey: trainingPlanKeys.details(),
        })) {
          if (cached?.id !== trainingPlanId) continue;
          const optimistic: InternalTrainingPlanDetails = {
            ...cached,
            ...changes,
            [optimisticPlanToken]: token,
            updatedAt,
          };
          details.push({ previous: cached, queryKey, token });
          queryClient.setQueryData(queryKey, optimistic);
        }

        try {
          const updated = await updateGlobalTrainingPlan(
            trainingPlanId,
            changes,
            currentVersion,
            scenario,
          );
          for (const { queryKey } of lists) {
            queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
              queryKey,
              (current) =>
                current === undefined
                  ? current
                  : {
                      ...current,
                      data: current.data.map((plan) =>
                        plan.id === updated.id ? updated : plan,
                      ),
                    },
            );
          }
          for (const { queryKey } of details) {
            queryClient.setQueryData<TrainingPlanDetails>(
              queryKey,
              (current) =>
                current?.id === updated.id
                  ? { ...current, ...updated }
                  : current,
            );
          }
          return { data: updated, version: updated.version };
        } catch (error) {
          for (const { previous, queryKey, token: entryToken } of lists) {
            queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
              queryKey,
              (current) =>
                current === undefined
                  ? current
                  : {
                      ...current,
                      data: current.data.map((plan) =>
                        (plan as InternalTrainingPlanSummary)[
                          optimisticPlanToken
                        ] === entryToken
                          ? previous
                          : plan,
                      ),
                    },
            );
          }
          for (const { previous, queryKey, token: entryToken } of details) {
            queryClient.setQueryData<TrainingPlanDetails>(
              queryKey,
              (current) =>
                current !== undefined &&
                optimisticPlanToken in current &&
                current[optimisticPlanToken] === entryToken
                  ? previous
                  : current,
            );
          }
          throw error;
        }
      }),
    onSettled: async (_data, error, variables) => {
      if (
        isTrainingPlanVersionConflict(error) ||
        coordinator.snapshot(variables.trainingPlanId).paused
      )
        return;
      await invalidateTrainingPlanQueries(
        queryClient,
        variables.trainingPlanId,
      );
    },
  });

  return result;
}

export function useDeleteTrainingPlanMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const coordinator = getAggregateMutationCoordinator(queryClient);
  const result = useMutation({
    mutationFn: async ({
      trainingPlanId,
      version,
    }: {
      trainingPlanId: string;
      version: number;
    }) =>
      coordinator.enqueue(trainingPlanId, version, async (currentVersion) => {
        await cancelTrainingPlanQueries(queryClient, trainingPlanId);
        const token = `delete-${crypto.randomUUID()}`;
        const entries: RemovedPlanEntry[] = [];
        for (const [
          queryKey,
          cached,
        ] of queryClient.getQueriesData<GlobalTrainingPlanCollectionResponse>({
          queryKey: trainingPlanKeys.lists(),
        })) {
          if (cached === undefined) continue;
          const previousIndex = cached.data.findIndex(
            (plan) => plan.id === trainingPlanId,
          );
          entries.push({
            previousIndex,
            previousPlan:
              previousIndex < 0 ? undefined : cached.data[previousIndex],
            queryKey,
          });
          queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
            queryKey,
            {
              ...addOptimisticDelta(cached, token, -1),
              data: cached.data.filter((plan) => plan.id !== trainingPlanId),
            },
          );
        }

        try {
          await deleteGlobalTrainingPlan(
            trainingPlanId,
            currentVersion,
            scenario,
          );
          for (const { queryKey } of entries) {
            queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
              queryKey,
              (cached) =>
                cached === undefined
                  ? cached
                  : settleOptimisticDelta(cached, token, 0),
            );
          }
          queryClient.removeQueries({
            predicate: (query) =>
              detailMatchesTrainingPlan(query.queryKey, trainingPlanId),
          });
          return { data: undefined, version: currentVersion };
        } catch (error) {
          for (const { previousIndex, previousPlan, queryKey } of entries) {
            queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
              queryKey,
              (cached) => {
                if (cached === undefined) return cached;
                const settled = settleOptimisticDelta(cached, token, 1);
                if (previousPlan === undefined) return settled;
                return {
                  ...settled,
                  data: insertAtPreviousPosition(
                    settled.data,
                    previousPlan,
                    previousIndex,
                  ),
                };
              },
            );
          }
          throw error;
        }
      }),
    onSettled: async (_data, error, variables) => {
      if (
        isTrainingPlanVersionConflict(error) ||
        coordinator.snapshot(variables.trainingPlanId).paused
      )
        return;
      await queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.lists(),
      });
      if (error !== null)
        await invalidateTrainingPlanQueries(
          queryClient,
          variables.trainingPlanId,
        );
    },
  });

  return result;
}

export function useCreateTrainingPlanWorkoutMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const coordinator = getAggregateMutationCoordinator(queryClient);
  const result = useMutation({
    mutationFn: async ({
      trainingPlanId,
      version,
    }: {
      trainingPlanId: string;
      version: number;
    }) =>
      coordinator.enqueue(trainingPlanId, version, async (currentVersion) => {
        const created = await createTrainingPlanWorkout(
          trainingPlanId,
          currentVersion,
          scenario,
        );
        for (const [queryKey] of queryClient.getQueriesData({
          queryKey: trainingPlanKeys.details(),
        })) {
          queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
            cached?.id === trainingPlanId
              ? {
                  ...cached,
                  version: created.version,
                  workouts: [...cached.workouts, created.data],
                }
              : cached,
          );
        }
        return { data: created, version: created.version };
      }),
    onSettled: async (_data, error, variables) => {
      if (
        isTrainingPlanVersionConflict(error) ||
        coordinator.snapshot(variables.trainingPlanId).paused
      )
        return;
      await invalidateTrainingPlanQueries(
        queryClient,
        variables.trainingPlanId,
      );
    },
  });

  return result;
}

export function useDeleteTrainingPlanWorkoutMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const coordinator = getAggregateMutationCoordinator(queryClient);
  const result = useMutation({
    mutationFn: async ({
      trainingPlanId,
      workoutId,
      version,
    }: {
      trainingPlanId: string;
      workoutId: string;
      version: number;
    }) =>
      coordinator.enqueue(trainingPlanId, version, async (currentVersion) => {
        await queryClient.cancelQueries({
          predicate: (query) =>
            detailMatchesTrainingPlan(query.queryKey, trainingPlanId),
        });
        const removed: RemovedWorkoutEntry[] = [];
        for (const [
          queryKey,
          cached,
        ] of queryClient.getQueriesData<TrainingPlanDetails>({
          queryKey: trainingPlanKeys.details(),
        })) {
          if (cached?.id !== trainingPlanId) continue;
          const previousIndex = cached.workouts.findIndex(
            (workout) => workout.id === workoutId,
          );
          const previousWorkout = cached.workouts[previousIndex];
          if (previousWorkout === undefined) continue;
          removed.push({ previousIndex, previousWorkout, queryKey });
          queryClient.setQueryData<TrainingPlanDetails>(queryKey, {
            ...cached,
            workouts: cached.workouts.filter(
              (workout) => workout.id !== workoutId,
            ),
          });
        }

        try {
          const nextVersion = await deleteTrainingPlanWorkout(
            trainingPlanId,
            workoutId,
            currentVersion,
            scenario,
          );
          for (const { queryKey } of removed) {
            queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
              cached?.id === trainingPlanId
                ? { ...cached, version: nextVersion }
                : cached,
            );
          }
          return { data: undefined, version: nextVersion };
        } catch (error) {
          for (const { previousIndex, previousWorkout, queryKey } of removed) {
            queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
              cached?.id === trainingPlanId
                ? {
                    ...cached,
                    workouts: insertAtPreviousPosition(
                      cached.workouts,
                      previousWorkout,
                      previousIndex,
                    ),
                  }
                : cached,
            );
          }
          throw error;
        }
      }),
    onSettled: async (_data, error, variables) => {
      if (
        isTrainingPlanVersionConflict(error) ||
        coordinator.snapshot(variables.trainingPlanId).paused
      )
        return;
      await invalidateTrainingPlanQueries(
        queryClient,
        variables.trainingPlanId,
      );
    },
  });

  return result;
}
