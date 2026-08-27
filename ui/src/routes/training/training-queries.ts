import { queryOptions } from '@tanstack/react-query';

import {
  getTrainingOverview,
  getTrainingSession,
  getTrainingWorkoutPreview,
  getWorkoutExecutionSummary,
  type MockTrainingScenario,
} from '~/routes/training/training-service';

export const trainingKeys = {
  all: ['training'] as const,
  completion: (executionId: string, scenario: MockTrainingScenario) =>
    [...trainingKeys.all, 'completion', executionId, scenario] as const,
  overview: (scenario: MockTrainingScenario) =>
    [...trainingKeys.all, 'overview', scenario] as const,
  preview: (workoutId: string, scenario: MockTrainingScenario) =>
    [...trainingKeys.all, 'preview', workoutId, scenario] as const,
  session: (scenario: MockTrainingScenario) =>
    [...trainingKeys.all, 'session', scenario] as const,
};

export function trainingOverviewQueryOptions(scenario: MockTrainingScenario) {
  return queryOptions({
    queryKey: trainingKeys.overview(scenario),
    queryFn: ({ signal }) => getTrainingOverview(scenario, signal),
  });
}

export function trainingPreviewQueryOptions(
  workoutId: string,
  scenario: MockTrainingScenario,
) {
  return queryOptions({
    queryKey: trainingKeys.preview(workoutId, scenario),
    queryFn: ({ signal }) =>
      getTrainingWorkoutPreview(workoutId, scenario, signal),
  });
}

export function trainingSessionQueryOptions(scenario: MockTrainingScenario) {
  return queryOptions({
    queryKey: trainingKeys.session(scenario),
    queryFn: ({ signal }) => getTrainingSession(scenario, signal),
    retry: false,
  });
}

export function trainingCompletionQueryOptions(
  executionId: string,
  scenario: MockTrainingScenario,
) {
  return queryOptions({
    queryKey: trainingKeys.completion(executionId, scenario),
    queryFn: ({ signal }) =>
      getWorkoutExecutionSummary(executionId, scenario, signal),
  });
}
