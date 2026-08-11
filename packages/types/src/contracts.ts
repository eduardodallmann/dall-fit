import type {
  Exercise,
  ExerciseImage,
  ExerciseType,
  Person,
  Theme,
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutDetails,
  TrainingPlanWorkoutSummary,
} from './entities.js';

export interface ApiError {
  code: string;
  message: string;
  details: Readonly<Record<string, unknown>>;
  requestId: string;
}

export interface ApiResponse<TData> {
  data: TData;
}

export interface CollectionResponse<TData> {
  data: readonly TData[];
  page: number;
  pageSize: number;
  total: number;
}

export type CurrentPersonResponse = ApiResponse<Person>;

export interface UpdateCurrentPersonConfigsRequest {
  theme: Theme;
}

export type UpdateCurrentPersonConfigsResponse = ApiResponse<Person>;

export type CsrfTokenResponse = ApiResponse<{
  token: string;
}>;

export interface CreateTrainingPlanRequest {
  name: string;
  description: string;
}

export interface UpdateTrainingPlanRequest {
  name?: string;
  description?: string;
}

export type GlobalTrainingPlanCollectionResponse =
  CollectionResponse<TrainingPlanSummary>;

export type CreateTrainingPlanResponse = ApiResponse<TrainingPlanSummary>;
export type UpdateTrainingPlanResponse = ApiResponse<TrainingPlanSummary>;
export type TrainingPlanDetailsResponse = ApiResponse<TrainingPlanDetails>;
export type CreateTrainingPlanWorkoutResponse =
  ApiResponse<TrainingPlanWorkoutSummary>;

export interface UpdateTrainingPlanWorkoutRequest {
  name: string;
}

export type TrainingPlanWorkoutDetailsResponse =
  ApiResponse<TrainingPlanWorkoutDetails>;

export type UpdateTrainingPlanWorkoutResponse = ApiResponse<{
  id: string;
  name: string;
  updatedAt: string;
}>;

export interface CreateExerciseRequest {
  type: ExerciseType;
}

export type CreateExerciseResponse = ApiResponse<Exercise>;

export type UpdateExerciseRequest = Partial<
  Pick<
    Extract<Exercise, { type: 'youtube-short' }>,
    'bodyArea' | 'name' | 'repetitions' | 'restSeconds' | 'sets' | 'youtubeId'
  > &
    Pick<Extract<Exercise, { type: 'duration' }>, 'durationMinutes'>
>;

export type UpdateExerciseResponse = ApiResponse<Exercise>;

export interface ReorderExercisesRequest {
  exerciseIds: string[];
}

export type UpdateExerciseImageResponse = ApiResponse<{
  image: ExerciseImage;
}>;
