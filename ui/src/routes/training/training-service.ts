import type {
  CompleteRemainingTrainingSeriesRequest,
  CompleteTrainingSeriesRequest,
  CompleteTrainingSessionRequest,
  OfflineTrainingLeaseResponse,
  RegisterOfflineTrainingLeaseRequest,
  ResolveTrainingTimerRequest,
  StartTrainingTimerRequest,
  TrainingLoadRequest,
  TrainingOverview,
  TrainingOverviewResponse,
  TrainingSession,
  TrainingSessionResponse,
  TrainingWorkoutPreview,
  TrainingWorkoutPreviewResponse,
  WorkoutExecutionSummary,
  WorkoutExecutionSummaryResponse,
} from '@dall-fit/types';

import { apiClient } from '~/core/http/api-client';

export type MockTrainingScenario =
  | 'active-plan'
  | 'multiple-active'
  | 'duration-running'
  | 'exercise-completed'
  | 'load-pending'
  | 'no-active-plan'
  | 'pause-running'
  | 'series-running'
  | 'session-expired'
  | 'session-running'
  | 'workout-complete'
  | 'workout-incomplete'
  | 'workout-preview'
  | 'youtube-long-running';

export function trainingMockSearch(scenario: MockTrainingScenario): {
  catalogEntryId?: string;
  mockTraining?: MockTrainingScenario;
} {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
    ? { mockTraining: scenario }
    : {};
}

const resourceVersionHeader = 'X-Resource-Version';

function config(scenario: MockTrainingScenario, signal?: AbortSignal) {
  const headers =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { 'x-dall-fit-mock-training': scenario }
      : undefined;
  return { headers, signal };
}

function mutationConfig(scenario: MockTrainingScenario, version?: number) {
  const base = config(scenario);
  return {
    ...base,
    headers: {
      ...base.headers,
      ...(version === undefined
        ? {}
        : { [resourceVersionHeader]: String(version) }),
    },
  };
}

export async function getTrainingOverview(
  scenario: MockTrainingScenario,
  catalogEntryId?: string,
  signal?: AbortSignal,
): Promise<TrainingOverview> {
  const response = await apiClient.get<TrainingOverviewResponse>('/training', {
    ...config(scenario, signal),
    params: { catalogEntryId },
  });
  return response.data.data;
}

export async function getTrainingWorkoutPreview(
  workoutId: string,
  scenario: MockTrainingScenario,
  catalogEntryId?: string,
  signal?: AbortSignal,
): Promise<TrainingWorkoutPreview> {
  const response = await apiClient.get<TrainingWorkoutPreviewResponse>(
    `/training/workouts/${workoutId}`,
    { ...config(scenario, signal), params: { catalogEntryId } },
  );
  return response.data.data;
}

export async function startTrainingSession(
  workoutId: string,
  scenario: MockTrainingScenario,
  catalogEntryId?: string,
): Promise<TrainingSession> {
  const response = await apiClient.post<TrainingSessionResponse>(
    `/training/workouts/${workoutId}/session`,
    {},
    { ...mutationConfig(scenario), params: { catalogEntryId } },
  );
  return response.data.data;
}

export async function getTrainingSession(
  scenario: MockTrainingScenario,
  signal?: AbortSignal,
): Promise<TrainingSession> {
  const response = await apiClient.get<TrainingSessionResponse>(
    '/training/session',
    config(scenario, signal),
  );
  return response.data.data;
}

export async function abandonTrainingSession(
  scenario: MockTrainingScenario,
): Promise<void> {
  await apiClient.delete('/training/session', mutationConfig(scenario));
}

export async function saveTrainingLoad(
  exerciseId: string,
  seriesNumber: number,
  loadKg: number | null,
  version: number,
  scenario: MockTrainingScenario,
): Promise<TrainingSession> {
  const input: TrainingLoadRequest = { loadKg };
  const response = await apiClient.put<TrainingSessionResponse>(
    `/training/session/exercises/${exerciseId}/series/${seriesNumber}/load`,
    input,
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function completeTrainingSeries(
  exerciseId: string,
  seriesNumber: number,
  loadKg: number | null,
  version: number,
  scenario: MockTrainingScenario,
): Promise<TrainingSession> {
  const input: CompleteTrainingSeriesRequest = { loadKg };
  const response = await apiClient.post<TrainingSessionResponse>(
    `/training/session/exercises/${exerciseId}/series/${seriesNumber}/complete`,
    input,
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function completeRemainingTrainingSeries(
  exerciseId: string,
  loadsKg: readonly (number | null)[],
  version: number,
  scenario: MockTrainingScenario,
): Promise<TrainingSession> {
  const input: CompleteRemainingTrainingSeriesRequest = { loadsKg };
  const response = await apiClient.post<TrainingSessionResponse>(
    `/training/session/exercises/${exerciseId}/series/complete-remaining`,
    input,
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function startTrainingTimer(
  exerciseId: string,
  kind: 'duration' | 'pause',
  version: number,
  scenario: MockTrainingScenario,
): Promise<TrainingSession> {
  const input: StartTrainingTimerRequest = { kind };
  const response = await apiClient.post<TrainingSessionResponse>(
    `/training/session/exercises/${exerciseId}/timer`,
    input,
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function resolveTrainingTimer(
  outcome: 'cancel' | 'finish' | 'skip',
  version: number,
  scenario: MockTrainingScenario,
): Promise<TrainingSession> {
  const input: ResolveTrainingTimerRequest = { outcome };
  const response = await apiClient.post<TrainingSessionResponse>(
    '/training/session/timer/resolve',
    input,
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function completeTrainingExercise(
  exerciseId: string,
  version: number,
  scenario: MockTrainingScenario,
): Promise<TrainingSession> {
  const response = await apiClient.post<TrainingSessionResponse>(
    `/training/session/exercises/${exerciseId}/complete`,
    {},
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function restartTrainingExercise(
  exerciseId: string,
  version: number,
  scenario: MockTrainingScenario,
): Promise<TrainingSession> {
  const response = await apiClient.post<TrainingSessionResponse>(
    `/training/session/exercises/${exerciseId}/restart`,
    {},
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function completeTrainingSession(
  confirmIncomplete: boolean,
  timezone: string,
  version: number,
  scenario: MockTrainingScenario,
): Promise<WorkoutExecutionSummary> {
  const input: CompleteTrainingSessionRequest = {
    confirmIncomplete,
    timezone,
  };
  const response = await apiClient.post<WorkoutExecutionSummaryResponse>(
    '/training/session/complete',
    input,
    mutationConfig(scenario, version),
  );
  return response.data.data;
}

export async function getWorkoutExecutionSummary(
  executionId: string,
  scenario: MockTrainingScenario,
  signal?: AbortSignal,
): Promise<WorkoutExecutionSummary> {
  const response = await apiClient.get<WorkoutExecutionSummaryResponse>(
    `/training/completions/${executionId}`,
    config(scenario, signal),
  );
  return response.data.data;
}

export async function registerOfflineTrainingLease(
  installationId: string,
): Promise<OfflineTrainingLeaseResponse['data']> {
  const input: RegisterOfflineTrainingLeaseRequest = { installationId };
  const response = await apiClient.put<OfflineTrainingLeaseResponse>(
    '/training/offline-lease',
    input,
  );
  return response.data.data;
}

export async function takeoverOfflineTrainingLease(
  installationId: string,
): Promise<OfflineTrainingLeaseResponse['data']> {
  const input: RegisterOfflineTrainingLeaseRequest = { installationId };
  const response = await apiClient.post<OfflineTrainingLeaseResponse>(
    '/training/offline-lease/takeover',
    input,
  );
  return response.data.data;
}
