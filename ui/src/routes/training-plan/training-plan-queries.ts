import { queryOptions } from '@tanstack/react-query';

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
  workouts: () => [...trainingPlanKeys.all, 'workout'] as const,
  workout: (
    trainingPlanId: string,
    workoutId: string,
    scenario: MockTrainingPlansScenario,
  ) =>
    [
      ...trainingPlanKeys.workouts(),
      trainingPlanId,
      workoutId,
      scenario,
    ] as const,
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
