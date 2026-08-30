import type {
  Exercise,
  ExerciseImage,
  ExerciseType,
  GlobalTrainingPlanDetails,
  GlobalTrainingPlanLibraryItem,
  GlobalTrainingPlanSummary,
  GlobalTrainingPlanWorkoutDetails,
  Person,
  PersonalTrainingPlanDetails,
  PersonalTrainingPlanListItem,
  Theme,
  TrainingOverview,
  TrainingPlanAssistantSession,
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutDetails,
  TrainingPlanWorkoutSummary,
  TrainingSession,
  TrainingWorkoutPreview,
  WorkoutExecutionSummary,
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

export type RealtimeResourceInvalidation =
  | {
      resource: 'global-training-plan';
      resourceId: string;
      state: 'deleted';
    }
  | {
      resource: 'global-training-plan';
      resourceId: string;
      state: 'present';
      version: number;
    };

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
  CollectionResponse<GlobalTrainingPlanSummary>;

export type PersonalTrainingPlanCollectionResponse =
  CollectionResponse<PersonalTrainingPlanListItem>;

export type GlobalTrainingPlanLibraryResponse =
  CollectionResponse<GlobalTrainingPlanLibraryItem>;

export type PersonalTrainingPlanDetailsResponse =
  ApiResponse<PersonalTrainingPlanDetails>;

export type CreatePersonalTrainingPlanResponse =
  ApiResponse<PersonalTrainingPlanListItem>;

export type GlobalTrainingPlanDetailsResponse =
  ApiResponse<GlobalTrainingPlanDetails>;

export interface CreateGlobalTrainingPlanReferenceRequest {
  globalTrainingPlanId: string;
}

export type CreateGlobalTrainingPlanReferenceResponse =
  ApiResponse<PersonalTrainingPlanListItem>;

export interface ActivatePersonalTrainingPlanRequest {
  catalogEntryId: string;
}

export type ActivatePersonalTrainingPlanResponse = ApiResponse<{
  activeCatalogEntryId: string;
}>;

export interface CreateTrainingPlanCloneJobRequest {
  globalTrainingPlanId: string;
}

export type TrainingPlanCloneJobResponse =
  ApiResponse<PersonalTrainingPlanListItem>;

export interface StartTrainingPlanCloneRunV1 {
  cloneJobId: string;
  generation: number;
}

export type StartTrainingPlanCloneRunResponse = ApiResponse<{
  accepted: true;
  generation: number;
}>;

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

export type GlobalTrainingPlanWorkoutDetailsResponse =
  ApiResponse<GlobalTrainingPlanWorkoutDetails>;

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

export type TrainingOverviewResponse = ApiResponse<TrainingOverview>;
export type TrainingWorkoutPreviewResponse =
  ApiResponse<TrainingWorkoutPreview>;
export type TrainingSessionResponse = ApiResponse<TrainingSession>;
export type WorkoutExecutionSummaryResponse =
  ApiResponse<WorkoutExecutionSummary>;

export interface TrainingLoadRequest {
  loadKg: number | null;
}

export type CompleteTrainingSeriesRequest = TrainingLoadRequest;

export interface CompleteRemainingTrainingSeriesRequest {
  loadsKg: readonly (number | null)[];
}

export interface StartTrainingTimerRequest {
  kind: 'duration' | 'pause';
}

export interface ResolveTrainingTimerRequest {
  outcome: 'cancel' | 'finish' | 'skip';
}

export interface CompleteTrainingSessionRequest {
  confirmIncomplete: boolean;
  timezone: string;
}

export type TrainingPlanAssistantSessionResponse =
  ApiResponse<TrainingPlanAssistantSession>;

export interface CreateTrainingPlanAssistantSessionRequest {
  noticeVersion: string;
}

export interface SendTrainingPlanAssistantMessageRequest {
  clientMessageId: string;
  text: string;
}

export interface GenerateTrainingPlanAssistantDraftRequest {
  adjustment?: string;
}

export type TrainingPlanAssistantConfirmationResponse = ApiResponse<{
  catalogEntryId: string;
  trainingPlanId: string;
}>;
