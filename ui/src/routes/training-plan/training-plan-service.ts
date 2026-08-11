import type {
  CreateExerciseRequest,
  CreateExerciseResponse,
  CreateTrainingPlanRequest,
  CreateTrainingPlanResponse,
  CreateTrainingPlanWorkoutResponse,
  Exercise,
  ExerciseImage,
  GlobalTrainingPlanCollectionResponse,
  ReorderExercisesRequest,
  TrainingPlanDetails,
  TrainingPlanDetailsResponse,
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

import { apiClient } from '~/core/http/api-client';

export type MockTrainingPlansScenario =
  | 'create-error'
  | 'create-success'
  | 'create-workout-error'
  | 'delete-error'
  | 'delete-success'
  | 'delete-workout-error'
  | 'delete-workout-success'
  | 'detail-error'
  | 'empty'
  | 'list-error'
  | 'loading'
  | 'not-found'
  | 'success'
  | 'update-error'
  | 'update-success'
  | 'update-exercise-error'
  | 'delete-exercise-error'
  | 'image-error'
  | 'version-conflict';

export interface VersionedMutationResult<T> {
  data: T;
  version: number;
}

function ifMatch(trainingPlanId: string, version: number) {
  return `"training-plan:${trainingPlanId}:${version}"`;
}

function versionFromEtag(etag: string | undefined, fallback: number): number {
  const match = /:(\d+)"$/.exec(etag ?? '');
  return match === null ? fallback : Number(match[1]);
}

function mutationConfig(
  mockScenario: MockTrainingPlansScenario,
  trainingPlanId: string,
  version: number,
) {
  const base = requestConfig(mockScenario);
  return {
    ...base,
    headers: { ...base?.headers, 'If-Match': ifMatch(trainingPlanId, version) },
  };
}

function requestConfig(mockScenario: MockTrainingPlansScenario) {
  const result =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
      ? { headers: { 'x-dall-fit-mock-training-plans': mockScenario } }
      : undefined;

  return result;
}

export async function listGlobalTrainingPlans(
  page: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<GlobalTrainingPlanCollectionResponse> {
  const response = await apiClient.get<GlobalTrainingPlanCollectionResponse>(
    '/global/training-plans',
    { ...requestConfig(mockScenario), params: { page } },
  );
  const result = response.data;

  return result;
}

export async function getGlobalTrainingPlan(
  trainingPlanId: string,
  mockScenario: MockTrainingPlansScenario,
): Promise<TrainingPlanDetails> {
  const response = await apiClient.get<TrainingPlanDetailsResponse>(
    `/global/training-plans/${trainingPlanId}`,
    requestConfig(mockScenario),
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
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  const result = response.data.data;

  return result;
}

export async function deleteGlobalTrainingPlan(
  trainingPlanId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<void> {
  await apiClient.delete(
    `/global/training-plans/${trainingPlanId}`,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
}

export async function createTrainingPlanWorkout(
  trainingPlanId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<VersionedMutationResult<TrainingPlanWorkoutSummary>> {
  const response = await apiClient.post<CreateTrainingPlanWorkoutResponse>(
    `/global/training-plans/${trainingPlanId}/workouts`,
    {},
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  const result = {
    data: response.data.data,
    version: versionFromEtag(
      response.headers.etag as string | undefined,
      version + 1,
    ),
  };

  return result;
}

export async function deleteTrainingPlanWorkout(
  trainingPlanId: string,
  workoutId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<number> {
  const response = await apiClient.delete(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}`,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return versionFromEtag(
    response.headers.etag as string | undefined,
    version + 1,
  );
}

export async function getTrainingPlanWorkout(
  trainingPlanId: string,
  workoutId: string,
  mockScenario: MockTrainingPlansScenario,
): Promise<TrainingPlanWorkoutDetails> {
  const response = await apiClient.get<TrainingPlanWorkoutDetailsResponse>(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}`,
    requestConfig(mockScenario),
  );
  return response.data.data;
}

export async function updateTrainingPlanWorkout(
  trainingPlanId: string,
  workoutId: string,
  name: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<
  VersionedMutationResult<{ id: string; name: string; updatedAt: string }>
> {
  const response = await apiClient.patch<{
    data: { id: string; name: string; updatedAt: string };
  }>(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}`,
    { name },
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return {
    data: response.data.data,
    version: versionFromEtag(
      response.headers.etag as string | undefined,
      version + 1,
    ),
  };
}

export async function createTrainingPlanExercise(
  trainingPlanId: string,
  workoutId: string,
  input: CreateExerciseRequest,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<VersionedMutationResult<Exercise>> {
  const response = await apiClient.post<CreateExerciseResponse>(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}/exercises`,
    input,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return {
    data: response.data.data,
    version: versionFromEtag(
      response.headers.etag as string | undefined,
      version + 1,
    ),
  };
}

export async function updateTrainingPlanExercise(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  changes: UpdateExerciseRequest,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<VersionedMutationResult<Exercise>> {
  const response = await apiClient.patch<UpdateExerciseResponse>(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}/exercises/${exerciseId}`,
    changes,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return {
    data: response.data.data,
    version: versionFromEtag(
      response.headers.etag as string | undefined,
      version + 1,
    ),
  };
}

export async function deleteTrainingPlanExercise(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<number> {
  const response = await apiClient.delete(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}/exercises/${exerciseId}`,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return versionFromEtag(
    response.headers.etag as string | undefined,
    version + 1,
  );
}

export async function reorderTrainingPlanExercises(
  trainingPlanId: string,
  workoutId: string,
  input: ReorderExercisesRequest,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<number> {
  const response = await apiClient.put(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}/exercises/order`,
    input,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return versionFromEtag(
    response.headers.etag as string | undefined,
    version + 1,
  );
}

export async function uploadTrainingPlanExerciseImage(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  file: File,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<VersionedMutationResult<ExerciseImage>> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiClient.put<UpdateExerciseImageResponse>(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}/exercises/${exerciseId}/image`,
    form,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return {
    data: response.data.data.image,
    version: versionFromEtag(
      response.headers.etag as string | undefined,
      version + 1,
    ),
  };
}

export async function removeTrainingPlanExerciseImage(
  trainingPlanId: string,
  workoutId: string,
  exerciseId: string,
  version: number,
  mockScenario: MockTrainingPlansScenario,
): Promise<number> {
  const response = await apiClient.delete(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}/exercises/${exerciseId}/image`,
    mutationConfig(mockScenario, trainingPlanId, version),
  );
  return versionFromEtag(
    response.headers.etag as string | undefined,
    version + 1,
  );
}
