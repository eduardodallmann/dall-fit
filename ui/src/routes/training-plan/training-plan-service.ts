import type {
  CreateExerciseRequest,
  CreateExerciseResponse,
  CreateTrainingPlanRequest,
  CreateTrainingPlanResponse,
  CreateTrainingPlanWorkoutResponse,
  Exercise,
  ExerciseImage,
  GlobalTrainingPlanCollectionResponse,
  GlobalTrainingPlanDetails,
  GlobalTrainingPlanDetailsResponse,
  GlobalTrainingPlanWorkoutDetails,
  GlobalTrainingPlanWorkoutDetailsResponse,
  ReorderExercisesRequest,
  TrainingPlanSummary,
  TrainingPlanWorkoutDetails,
  TrainingPlanWorkoutDetailsResponse,
  TrainingPlanWorkoutSummary,
  UpdateExerciseImageResponse,
  UpdateExerciseRequest,
  UpdateExerciseResponse,
  UpdateTrainingPlanRequest,
  UpdateTrainingPlanResponse,
} from '@dall-fit/types';

import { apiClient, UPLOAD_REQUEST_TIMEOUT } from '~/core/http/api-client';

export type MockTrainingPlansScenario =
  | 'assistant-abandon'
  | 'assistant-blocked'
  | 'assistant-clarifying'
  | 'assistant-collecting'
  | 'assistant-emergency'
  | 'assistant-health-clarification'
  | 'assistant-multiple-answers'
  | 'assistant-neutral-screening'
  | 'assistant-preview'
  | 'assistant-provider-error'
  | 'assistant-resumed'
  | 'assistant-version-conflict'
  | 'create-error'
  | 'create-success'
  | 'create-workout-error'
  | 'delete-error'
  | 'delete-success'
  | 'delete-workout-error'
  | 'delete-workout-success'
  | 'detail-error'
  | 'empty'
  | 'empty-workout'
  | 'list-error'
  | 'large-pagination'
  | 'library-empty'
  | 'loading'
  | 'not-found'
  | 'personal-mixed'
  | 'multiple-active'
  | 'active-limit'
  | 'personal-reference'
  | 'clone-running'
  | 'clone-failed'
  | 'usage-counts'
  | 'success'
  | 'update-error'
  | 'update-success'
  | 'update-exercise-error'
  | 'delete-exercise-error'
  | 'image-error'
  | 'image-signed-url-expired'
  | 'reorder-error'
  | 'two-pages'
  | 'timeout'
  | 'csrf-refresh'
  | 'version-conflict';

export type TrainingPlanResource = 'global' | 'personal';

function trainingPlanResourcePath(
  trainingPlanId: string,
  resource: TrainingPlanResource,
): string {
  const prefix =
    resource === 'global' ? '/global/training-plans' : '/training-plans';
  return `${prefix}/${trainingPlanId}`;
}

export function trainingPlanMockSearch(
  mockScenario: MockTrainingPlansScenario,
): { mockTrainingPlans?: MockTrainingPlansScenario } {
  const result =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { mockTrainingPlans: mockScenario }
      : {};

  return result;
}

export interface VersionedMutationResult<T> {
  data: T;
  version: number;
}

const RESOURCE_VERSION_HEADER = 'X-Resource-Version';
const resourceVersionPattern = /^(0|[1-9]\d*)$/;

function parseResourceVersion(value: unknown): number {
  if (typeof value !== 'string' || !resourceVersionPattern.test(value))
    throw new Error('API response has an invalid resource version.');
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error('API response has an invalid resource version.');
  return result;
}

function mutationConfig(
  mockScenario: MockTrainingPlansScenario,
  version: number,
) {
  const base = requestConfig(mockScenario);
  return {
    ...base,
    headers: { ...base?.headers, [RESOURCE_VERSION_HEADER]: String(version) },
  };
}

function responseVersion(headers: Record<string, unknown>): number {
  const result = parseResourceVersion(headers['x-resource-version']);
  return result;
}

function requestConfig(
  mockScenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
) {
  const headers =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { 'x-dall-fit-mock-training-plans': mockScenario }
      : undefined;
  const result = { headers, signal };

  return result;
}

export async function listGlobalTrainingPlans(
  page: number,
  mockScenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
): Promise<GlobalTrainingPlanCollectionResponse> {
  const response = await apiClient.get<GlobalTrainingPlanCollectionResponse>(
    '/global/training-plans',
    { ...requestConfig(mockScenario, signal), params: { page } },
  );
  const result = response.data;
  if (
    !Array.isArray(result.data) ||
    result.page !== page ||
    result.pageSize !== 20 ||
    !Number.isSafeInteger(result.total) ||
    result.total < 0
  )
    throw new Error('API response has invalid training plan pagination.');

  return result;
}

export async function getGlobalTrainingPlan(
  trainingPlanId: string,
  mockScenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
): Promise<GlobalTrainingPlanDetails> {
  const response = await apiClient.get<GlobalTrainingPlanDetailsResponse>(
    `/global/training-plans/${trainingPlanId}`,
    requestConfig(mockScenario, signal),
  );
  const result = response.data.data;

  return result;
}

export async function createGlobalTrainingPlan(
  input: CreateTrainingPlanRequest,
  mockScenario: MockTrainingPlansScenario,
): Promise<TrainingPlanSummary> {
  const response = await apiClient.post<CreateTrainingPlanResponse>(
    '/global/training-plans',
    input,
    requestConfig(mockScenario),
  );
  const result = response.data.data;

  return result;
}

export async function updateGlobalTrainingPlan(
  trainingPlanId: string,
  changes: UpdateTrainingPlanRequest,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<TrainingPlanSummary> {
  const response = await apiClient.patch<UpdateTrainingPlanResponse>(
    `/global/training-plans/${trainingPlanId}`,
    changes,
    mutationConfig(mockScenario, version),
  );
  const result = {
    ...response.data.data,
    version: responseVersion(response.headers),
  };

  return result;
}

export async function deleteGlobalTrainingPlan(
  trainingPlanId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<void> {
  await apiClient.delete(
    `/global/training-plans/${trainingPlanId}`,
    mutationConfig(mockScenario, version),
  );
}

export async function createTrainingPlanWorkout(
  trainingPlanId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<VersionedMutationResult<TrainingPlanWorkoutSummary>> {
  const response = await apiClient.post<CreateTrainingPlanWorkoutResponse>(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts`,
    {},
    mutationConfig(mockScenario, version),
  );
  const result = {
    data: response.data.data,
    version: responseVersion(response.headers),
  };

  return result;
}

export async function deleteTrainingPlanWorkout(
  trainingPlanId: string,
  workoutId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<number> {
  const response = await apiClient.delete(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}`,
    mutationConfig(mockScenario, version),
  );
  return responseVersion(response.headers);
}

export async function getTrainingPlanWorkout(
  trainingPlanId: string,
  workoutId: string,
  mockScenario: MockTrainingPlansScenario,
  signal?: AbortSignal,
  resource: TrainingPlanResource = 'global',
): Promise<TrainingPlanWorkoutDetails | GlobalTrainingPlanWorkoutDetails> {
  const response = await apiClient.get<
    | TrainingPlanWorkoutDetailsResponse
    | GlobalTrainingPlanWorkoutDetailsResponse
  >(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}`,
    requestConfig(mockScenario, signal),
  );
  return response.data.data;
}

export async function updateTrainingPlanWorkout(
  trainingPlanId: string,
  workoutId: string,
  name: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<
  VersionedMutationResult<{ id: string; name: string; updatedAt: string }>
> {
  const response = await apiClient.patch<{
    data: { id: string; name: string; updatedAt: string };
  }>(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}`,
    { name },
    mutationConfig(mockScenario, version),
  );
  return {
    data: response.data.data,
    version: responseVersion(response.headers),
  };
}

export async function createTrainingPlanExercise(
  trainingPlanId: string,
  workoutId: string,
  input: CreateExerciseRequest,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<VersionedMutationResult<Exercise>> {
  const response = await apiClient.post<CreateExerciseResponse>(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}/exercises`,
    input,
    mutationConfig(mockScenario, version),
  );
  return {
    data: response.data.data,
    version: responseVersion(response.headers),
  };
}

export async function updateTrainingPlanExercise(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  changes: UpdateExerciseRequest,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<VersionedMutationResult<Exercise>> {
  const response = await apiClient.patch<UpdateExerciseResponse>(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}/exercises/${exerciseId}`,
    changes,
    mutationConfig(mockScenario, version),
  );
  return {
    data: response.data.data,
    version: responseVersion(response.headers),
  };
}

export async function deleteTrainingPlanExercise(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<number> {
  const response = await apiClient.delete(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}/exercises/${exerciseId}`,
    mutationConfig(mockScenario, version),
  );
  return responseVersion(response.headers);
}

export async function reorderTrainingPlanExercises(
  trainingPlanId: string,
  workoutId: string,
  input: ReorderExercisesRequest,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<number> {
  const response = await apiClient.put(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}/exercises/order`,
    input,
    mutationConfig(mockScenario, version),
  );
  return responseVersion(response.headers);
}

export async function uploadTrainingPlanExerciseImage(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  file: File,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<VersionedMutationResult<ExerciseImage>> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiClient.put<UpdateExerciseImageResponse>(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}/exercises/${exerciseId}/image`,
    form,
    {
      ...mutationConfig(mockScenario, version),
      timeout: UPLOAD_REQUEST_TIMEOUT,
    },
  );
  return {
    data: response.data.data.image,
    version: responseVersion(response.headers),
  };
}

export async function removeTrainingPlanExerciseImage(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
  resource: TrainingPlanResource = 'global',
): Promise<number> {
  const response = await apiClient.delete(
    `${trainingPlanResourcePath(trainingPlanId, resource)}/workouts/${workoutId}/exercises/${exerciseId}/image`,
    mutationConfig(mockScenario, version),
  );
  return responseVersion(response.headers);
}
