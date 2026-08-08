import type {
  Person,
  Theme,
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutSummary,
} from './entities.js';

export interface ApiError {
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
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

export type StartGoogleLoginResponse = ApiResponse<{
  authorizationUrl: string;
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

export interface RequestContract<
  TBody = never,
  TParams = never,
  TQuery = never,
> {
  body: TBody;
  params: TParams;
  query: TQuery;
}
