import type {
  CreateTrainingPlanRequest,
  CreateTrainingPlanResponse,
  CreateTrainingPlanWorkoutResponse,
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetails,
  TrainingPlanDetailsResponse,
  TrainingPlanSummary,
  TrainingPlanWorkoutSummary,
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
  | 'update-success';

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
  mockScenario: MockTrainingPlansScenario,
): Promise<TrainingPlanSummary> {
  const response = await apiClient.patch<UpdateTrainingPlanResponse>(
    `/global/training-plans/${trainingPlanId}`,
    changes,
    requestConfig(mockScenario),
  );
  const result = response.data.data;

  return result;
}

export async function deleteGlobalTrainingPlan(
  trainingPlanId: string,
  mockScenario: MockTrainingPlansScenario,
): Promise<void> {
  await apiClient.delete(
    `/global/training-plans/${trainingPlanId}`,
    requestConfig(mockScenario),
  );
}

export async function createTrainingPlanWorkout(
  trainingPlanId: string,
  mockScenario: MockTrainingPlansScenario,
): Promise<TrainingPlanWorkoutSummary> {
  const response = await apiClient.post<CreateTrainingPlanWorkoutResponse>(
    `/global/training-plans/${trainingPlanId}/workouts`,
    {},
    requestConfig(mockScenario),
  );
  const result = response.data.data;

  return result;
}

export async function deleteTrainingPlanWorkout(
  trainingPlanId: string,
  workoutId: string,
  mockScenario: MockTrainingPlansScenario,
): Promise<void> {
  await apiClient.delete(
    `/global/training-plans/${trainingPlanId}/workouts/${workoutId}`,
    requestConfig(mockScenario),
  );
}
