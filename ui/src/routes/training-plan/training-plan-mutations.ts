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
  UpdateTrainingPlanRequest,
} from '@dall-fit/types';

import { trainingPlanKeys } from '~/routes/training-plan/training-plan-queries';
import {
  createGlobalTrainingPlan,
  createTrainingPlanWorkout,
  deleteGlobalTrainingPlan,
  deleteTrainingPlanWorkout,
  updateGlobalTrainingPlan,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';

interface QuerySnapshot {
  details: Array<[QueryKey, TrainingPlanDetails | undefined]>;
  lists: Array<[QueryKey, GlobalTrainingPlanCollectionResponse | undefined]>;
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

export function useCreateTrainingPlanMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const result = useMutation({
    mutationFn: (input: CreateTrainingPlanRequest) =>
      createGlobalTrainingPlan(input, scenario),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: trainingPlanKeys.lists() });
      const lists =
        queryClient.getQueriesData<GlobalTrainingPlanCollectionResponse>({
          queryKey: trainingPlanKeys.lists(),
        });
      const temporary = createTemporaryPlan(input);
      const firstPageKey = trainingPlanKeys.list(1, scenario);
      const firstPage =
        queryClient.getQueryData<GlobalTrainingPlanCollectionResponse>(
          firstPageKey,
        );
      const source =
        firstPage ?? lists.find(([, cached]) => cached !== undefined)?.[1];
      if (source !== undefined) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          firstPageKey,
          {
            ...source,
            data: [temporary, ...(firstPage?.data ?? source.data)].slice(
              0,
              source.pageSize,
            ),
            page: 1,
            total: source.total + 1,
          },
        );
      }
      return { firstPage, firstPageKey, lists, temporaryId: temporary.id };
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, cached] of context?.lists ?? []) {
        queryClient.setQueryData(queryKey, cached);
      }
      if (context !== undefined) {
        queryClient.setQueryData(context.firstPageKey, context.firstPage);
      }
    },
    onSuccess: (created, _input, context) => {
      const queryKeys = [
        ...(context?.lists.map(([queryKey]) => queryKey) ?? []),
        ...(context === undefined ? [] : [context.firstPageKey]),
      ];
      for (const queryKey of queryKeys) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          queryKey,
          (cached) =>
            cached === undefined
              ? cached
              : {
                  ...cached,
                  data: cached.data.map((plan) =>
                    plan.id === context?.temporaryId ? created : plan,
                  ),
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
  const result = useMutation({
    mutationFn: ({
      changes,
      version,
      trainingPlanId,
    }: {
      changes: UpdateTrainingPlanRequest;
      version: number;
      trainingPlanId: string;
    }) => updateGlobalTrainingPlan(trainingPlanId, changes, version, scenario),
    onMutate: async ({ changes, trainingPlanId }) => {
      await queryClient.cancelQueries({ queryKey: trainingPlanKeys.all });
      const snapshot: QuerySnapshot = {
        details: queryClient.getQueriesData<TrainingPlanDetails>({
          queryKey: trainingPlanKeys.details(),
        }),
        lists: queryClient.getQueriesData<GlobalTrainingPlanCollectionResponse>(
          {
            queryKey: trainingPlanKeys.lists(),
          },
        ),
      };
      const updatedAt = new Date().toISOString();
      for (const [queryKey] of snapshot.lists) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          queryKey,
          (cached) =>
            cached === undefined
              ? cached
              : {
                  ...cached,
                  data: cached.data.map((plan) =>
                    plan.id === trainingPlanId
                      ? { ...plan, ...changes, updatedAt }
                      : plan,
                  ),
                },
        );
      }
      for (const [queryKey] of snapshot.details) {
        queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
          cached?.id === trainingPlanId
            ? { ...cached, ...changes, updatedAt }
            : cached,
        );
      }

      return snapshot;
    },
    onError: (_error, _variables, snapshot) => {
      for (const [queryKey, cached] of snapshot?.lists ?? []) {
        queryClient.setQueryData(queryKey, cached);
      }
      for (const [queryKey, cached] of snapshot?.details ?? []) {
        queryClient.setQueryData(queryKey, cached);
      }
    },
    onSuccess: (updated) => {
      for (const [queryKey] of queryClient.getQueriesData({
        queryKey: trainingPlanKeys.lists(),
      })) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          queryKey,
          (cached) =>
            cached === undefined
              ? cached
              : {
                  ...cached,
                  data: cached.data.map((plan) =>
                    plan.id === updated.id ? updated : plan,
                  ),
                },
        );
      }
      for (const [queryKey] of queryClient.getQueriesData({
        queryKey: trainingPlanKeys.details(),
      })) {
        queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
          cached?.id === updated.id ? { ...cached, ...updated } : cached,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    },
  });

  return result;
}

export function useDeleteTrainingPlanMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const result = useMutation({
    mutationFn: ({
      trainingPlanId,
      version,
    }: {
      trainingPlanId: string;
      version: number;
    }) => deleteGlobalTrainingPlan(trainingPlanId, version, scenario),
    onMutate: async ({ trainingPlanId }) => {
      await queryClient.cancelQueries({ queryKey: trainingPlanKeys.all });
      const snapshot: QuerySnapshot = {
        details: queryClient.getQueriesData<TrainingPlanDetails>({
          queryKey: trainingPlanKeys.details(),
        }),
        lists: queryClient.getQueriesData<GlobalTrainingPlanCollectionResponse>(
          {
            queryKey: trainingPlanKeys.lists(),
          },
        ),
      };
      for (const [queryKey] of snapshot.lists) {
        queryClient.setQueryData<GlobalTrainingPlanCollectionResponse>(
          queryKey,
          (cached) =>
            cached === undefined
              ? cached
              : {
                  ...cached,
                  data: cached.data.filter(
                    (plan) => plan.id !== trainingPlanId,
                  ),
                  total: Math.max(0, cached.total - 1),
                },
        );
      }
      queryClient.removeQueries({
        queryKey: trainingPlanKeys.details(),
        predicate: (query) => query.queryKey.includes(trainingPlanId),
      });

      return snapshot;
    },
    onError: (_error, _trainingPlanId, snapshot) => {
      for (const [queryKey, cached] of snapshot?.lists ?? []) {
        queryClient.setQueryData(queryKey, cached);
      }
      for (const [queryKey, cached] of snapshot?.details ?? []) {
        queryClient.setQueryData(queryKey, cached);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: trainingPlanKeys.all });
    },
  });

  return result;
}

export function useCreateTrainingPlanWorkoutMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const result = useMutation({
    mutationFn: ({
      trainingPlanId,
      version,
    }: {
      trainingPlanId: string;
      version: number;
    }) => createTrainingPlanWorkout(trainingPlanId, version, scenario),
    onSuccess: (result, { trainingPlanId }) => {
      for (const [queryKey] of queryClient.getQueriesData({
        queryKey: trainingPlanKeys.details(),
      })) {
        queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
          cached?.id === trainingPlanId
            ? {
                ...cached,
                version: result.version,
                workouts: [...cached.workouts, result.data],
              }
            : cached,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.details(),
      });
    },
  });

  return result;
}

export function useDeleteTrainingPlanWorkoutMutation(
  scenario: MockTrainingPlansScenario,
) {
  const queryClient = useQueryClient();
  const result = useMutation({
    mutationFn: ({
      trainingPlanId,
      workoutId,
      version,
    }: {
      trainingPlanId: string;
      workoutId: string;
      version: number;
    }) =>
      deleteTrainingPlanWorkout(trainingPlanId, workoutId, version, scenario),
    onMutate: async ({ trainingPlanId, workoutId }) => {
      await queryClient.cancelQueries({ queryKey: trainingPlanKeys.details() });
      const details = queryClient.getQueriesData<TrainingPlanDetails>({
        queryKey: trainingPlanKeys.details(),
      });
      for (const [queryKey] of details) {
        queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
          cached?.id === trainingPlanId
            ? {
                ...cached,
                workouts: cached.workouts.filter(
                  (workout) => workout.id !== workoutId,
                ),
              }
            : cached,
        );
      }

      return { details };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, cached] of context?.details ?? []) {
        queryClient.setQueryData(queryKey, cached);
      }
    },
    onSuccess: (version, { trainingPlanId }) => {
      for (const [queryKey] of queryClient.getQueriesData({
        queryKey: trainingPlanKeys.details(),
      })) {
        queryClient.setQueryData<TrainingPlanDetails>(queryKey, (cached) =>
          cached?.id === trainingPlanId ? { ...cached, version } : cached,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: trainingPlanKeys.details(),
      });
    },
  });

  return result;
}
