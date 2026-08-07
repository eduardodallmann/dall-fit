import { queryOptions } from '@tanstack/react-query';

import {
  getGlobalTrainingPlan,
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
};

export function trainingPlanListQueryOptions(
  page: number,
  scenario: MockTrainingPlansScenario,
) {
  const result = queryOptions({
    queryKey: trainingPlanKeys.list(page, scenario),
    queryFn: () => listGlobalTrainingPlans(page, scenario),
  });

  return result;
}

export function trainingPlanDetailQueryOptions(
  trainingPlanId: string,
  scenario: MockTrainingPlansScenario,
) {
  const result = queryOptions({
    queryKey: trainingPlanKeys.detail(trainingPlanId, scenario),
    queryFn: () => getGlobalTrainingPlan(trainingPlanId, scenario),
  });

  return result;
}
