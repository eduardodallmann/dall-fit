import { queryOptions } from '@tanstack/react-query';

import {
  getPersonalTrainingPlan,
  listGlobalTrainingPlanLibrary,
  listPersonalTrainingPlans,
} from '~/routes/training-plan/personal-training-plan-service';
import {
  getGlobalTrainingPlan,
  getTrainingPlanWorkout,
  listGlobalTrainingPlans,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';

export const trainingPlanKeys = {
  all: ['training-plans'] as const,
  details: () => [...trainingPlanKeys.all, 'detail'] as const,
  detail: (trainingPlanId: string, scenario: MockTrainingPlansScenario) =>
    [...trainingPlanKeys.details(), trainingPlanId, scenario] as const,
  lists: () => [...trainingPlanKeys.all, 'list'] as const,
  list: (page: number, scenario: MockTrainingPlansScenario) =>
    [...trainingPlanKeys.lists(), page, scenario] as const,
  libraries: () => [...trainingPlanKeys.all, 'library'] as const,
  workouts: () => [...trainingPlanKeys.all, 'workout'] as const,
  workout: (
    trainingPlanId: string,
    workoutId: string,
    scenario: MockTrainingPlansScenario,
    resource: 'global' | 'personal' = 'global',
  ) =>
    [
      ...trainingPlanKeys.workouts(),
      trainingPlanId,
      workoutId,
      scenario,
      resource,
    ] as const,
  personalList: (page: number, scenario: MockTrainingPlansScenario) =>
    [...trainingPlanKeys.lists(), page, scenario, 'personal'] as const,
  personalDetail: (
    catalogEntryId: string,
    scenario: MockTrainingPlansScenario,
  ) =>
    [
      ...trainingPlanKeys.details(),
      catalogEntryId,
      scenario,
      'personal',
    ] as const,
  library: (page: number, scenario: MockTrainingPlansScenario) =>
    [...trainingPlanKeys.libraries(), page, scenario] as const,
};

export function trainingPlanListQueryOptions(
  page: number,
  scenario: MockTrainingPlansScenario,
) {
  const result = queryOptions({
    queryKey: trainingPlanKeys.list(page, scenario),
    queryFn: ({ signal }) => listGlobalTrainingPlans(page, scenario, signal),
  });

  return result;
}

export function trainingPlanWorkoutQueryOptions(
  trainingPlanId: string,
  workoutId: string,
  scenario: MockTrainingPlansScenario,
) {
  return queryOptions({
    queryKey: trainingPlanKeys.workout(trainingPlanId, workoutId, scenario),
    queryFn: ({ signal }) =>
      getTrainingPlanWorkout(trainingPlanId, workoutId, scenario, signal),
  });
}

export function trainingPlanDetailQueryOptions(
  trainingPlanId: string,
  scenario: MockTrainingPlansScenario,
) {
  const result = queryOptions({
    queryKey: trainingPlanKeys.detail(trainingPlanId, scenario),
    queryFn: ({ signal }) =>
      getGlobalTrainingPlan(trainingPlanId, scenario, signal),
  });

  return result;
}

export function personalTrainingPlanListQueryOptions(
  page: number,
  scenario: MockTrainingPlansScenario,
) {
  return queryOptions({
    queryKey: trainingPlanKeys.personalList(page, scenario),
    queryFn: ({ signal }) => listPersonalTrainingPlans(page, scenario, signal),
    refetchInterval: (query) =>
      query.state.data?.data.some((item) => item.itemType === 'clone-job')
        ? 2_000
        : false,
  });
}

export function personalTrainingPlanDetailQueryOptions(
  catalogEntryId: string,
  scenario: MockTrainingPlansScenario,
) {
  return queryOptions({
    queryKey: trainingPlanKeys.personalDetail(catalogEntryId, scenario),
    queryFn: ({ signal }) =>
      getPersonalTrainingPlan(catalogEntryId, scenario, signal),
  });
}

export function trainingPlanLibraryQueryOptions(
  page: number,
  scenario: MockTrainingPlansScenario,
) {
  return queryOptions({
    queryKey: trainingPlanKeys.library(page, scenario),
    queryFn: ({ signal }) =>
      listGlobalTrainingPlanLibrary(page, scenario, signal),
  });
}
