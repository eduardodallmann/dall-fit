import type { QueryClient, QueryKey } from '@tanstack/react-query';

import type {
  Exercise,
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetails,
  TrainingPlanWorkoutDetails,
} from '@dall-fit/types';

import { trainingPlanKeys } from '~/routes/training-plan/training-plan-queries';
import type {
  MockTrainingPlansScenario,
  TrainingPlanResource,
} from '~/routes/training-plan/training-plan-service';

interface WorkoutCacheTarget {
  mockScenario: MockTrainingPlansScenario;
  trainingPlanId: string;
  workoutId: string;
  resource?: TrainingPlanResource;
}

interface WorkoutCacheMutation extends WorkoutCacheTarget {
  version: number;
  updateDetail?: (detail: TrainingPlanDetails) => TrainingPlanDetails;
  updateWorkout: (
    workout: TrainingPlanWorkoutDetails,
  ) => TrainingPlanWorkoutDetails;
}

function listMatchesScenario(
  queryKey: QueryKey,
  mockScenario: MockTrainingPlansScenario,
): boolean {
  return (
    queryKey[0] === 'training-plans' &&
    queryKey[1] === 'list' &&
    queryKey[3] === mockScenario
  );
}

export function synchronizeWorkoutMutation(
  queryClient: QueryClient,
  {
    mockScenario,
    trainingPlanId,
    updateDetail,
    updateWorkout,
    version,
    workoutId,
    resource = 'global',
  }: WorkoutCacheMutation,
): void {
  queryClient.setQueryData<TrainingPlanWorkoutDetails>(
    trainingPlanKeys.workout(trainingPlanId, workoutId, mockScenario, resource),
    (current) =>
      current === undefined ? current : { ...updateWorkout(current), version },
  );
  queryClient.setQueryData<TrainingPlanDetails>(
    resource === 'personal'
      ? trainingPlanKeys.personalDetail(trainingPlanId, mockScenario)
      : trainingPlanKeys.detail(trainingPlanId, mockScenario),
    (current) => {
      if (current === undefined) return current;
      const synchronized = updateDetail?.(current) ?? current;
      return { ...synchronized, version };
    },
  );
  queryClient.setQueriesData<GlobalTrainingPlanCollectionResponse>(
    {
      predicate: (query) => listMatchesScenario(query.queryKey, mockScenario),
    },
    (current) =>
      current === undefined
        ? current
        : {
            ...current,
            data: current.data.map((plan) =>
              plan.id === trainingPlanId ? { ...plan, version } : plan,
            ),
          },
  );
}

export function replaceCachedExercise(
  exercises: readonly Exercise[],
  saved: Exercise,
): readonly Exercise[] {
  return exercises.map((exercise) =>
    exercise.id === saved.id ? saved : exercise,
  );
}

export function reorderCachedExercises(
  exercises: readonly Exercise[],
  exerciseIds: readonly string[],
): readonly Exercise[] {
  const positions = new Map(
    exerciseIds.map((exerciseId, index) => [exerciseId, index]),
  );
  return [...exercises].sort(
    (left, right) =>
      (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
