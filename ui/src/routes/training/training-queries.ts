import { queryOptions } from '@tanstack/react-query';

import type { TrainingRepository } from '~/routes/training/training-repository';
import type { MockTrainingScenario } from '~/routes/training/training-service';

export const trainingKeys = {
  all: ['training'] as const,
  completion: (executionId: string, scenario: MockTrainingScenario) =>
    [...trainingKeys.all, 'completion', executionId, scenario] as const,
  overview: (
    source: TrainingRepository['source'],
    scenario: MockTrainingScenario,
    catalogEntryId?: string,
  ) =>
    [
      ...trainingKeys.all,
      source,
      'overview',
      scenario,
      catalogEntryId,
    ] as const,
  preview: (
    source: TrainingRepository['source'],
    workoutId: string,
    scenario: MockTrainingScenario,
    catalogEntryId?: string,
  ) =>
    [
      ...trainingKeys.all,
      source,
      'preview',
      workoutId,
      scenario,
      catalogEntryId,
    ] as const,
  session: (
    source: TrainingRepository['source'],
    scenario: MockTrainingScenario,
  ) => [...trainingKeys.all, source, 'session', scenario] as const,
};

export function trainingOverviewQueryOptions(
  repository: TrainingRepository,
  scenario: MockTrainingScenario,
  catalogEntryId?: string,
) {
  return queryOptions({
    queryKey: trainingKeys.overview(
      repository.source,
      scenario,
      catalogEntryId,
    ),
    queryFn: ({ signal }) => repository.getOverview(catalogEntryId, signal),
  });
}

export function trainingPreviewQueryOptions(
  workoutId: string,
  repository: TrainingRepository,
  scenario: MockTrainingScenario,
  catalogEntryId?: string,
) {
  return queryOptions({
    queryKey: trainingKeys.preview(
      repository.source,
      workoutId,
      scenario,
      catalogEntryId,
    ),
    queryFn: ({ signal }) =>
      repository.getPreview(workoutId, catalogEntryId, signal),
  });
}

export function trainingSessionQueryOptions(
  repository: TrainingRepository,
  scenario: MockTrainingScenario,
) {
  return queryOptions({
    queryKey: trainingKeys.session(repository.source, scenario),
    queryFn: ({ signal }) => repository.getSession(signal),
    retry: false,
  });
}

export function trainingCompletionQueryOptions(
  executionId: string,
  repository: TrainingRepository,
  scenario: MockTrainingScenario,
) {
  return queryOptions({
    queryKey: trainingKeys.completion(executionId, scenario),
    queryFn: ({ signal }) => repository.getCompletion(executionId, signal),
  });
}
