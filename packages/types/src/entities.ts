export type EntityId = string;
export type Timestamp = string;

export interface Entity {
  id: EntityId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type Theme = 'dark' | 'light';

export interface PersonConfigs {
  theme?: Theme;
}

export interface Person extends Entity {
  configs: PersonConfigs;
  name: string;
  email: string;
  photoUrl: string | null;
  isAdmin?: true;
}

export interface TrainingPlanSummary extends Entity {
  name: string;
  description: string;
  version: number;
}

export interface GlobalTrainingPlanUsage {
  activePeople: number;
  linkedPeople: number;
}

export interface GlobalTrainingPlanSummary extends TrainingPlanSummary {
  usage: GlobalTrainingPlanUsage;
}

export interface GlobalTrainingPlanDetails extends TrainingPlanDetails {
  usage: GlobalTrainingPlanUsage;
}

export interface PersonalOwnedTrainingPlanItem extends TrainingPlanSummary {
  active: boolean;
  catalogEntryId: EntityId;
  itemType: 'training-plan';
  source: 'owned';
}

export interface PersonalGlobalReferenceTrainingPlanItem extends TrainingPlanSummary {
  active: boolean;
  catalogEntryId: EntityId;
  itemType: 'training-plan';
  source: 'global-reference';
}

export type TrainingPlanCloneJobState =
  'queued' | 'running' | 'cancelling' | 'failed' | 'start-failed';

export interface TrainingPlanCloneJobItem {
  cloneJobId: EntityId;
  completedImages: number;
  createdAt: Timestamp;
  generation: number;
  itemType: 'clone-job';
  sourceName: string;
  state: TrainingPlanCloneJobState;
  totalImages: number | null;
  updatedAt: Timestamp;
}

export type PersonalTrainingPlanListItem =
  | PersonalOwnedTrainingPlanItem
  | PersonalGlobalReferenceTrainingPlanItem
  | TrainingPlanCloneJobItem;

export interface PersonalTrainingPlanDetails extends TrainingPlanDetails {
  active: boolean;
  catalogEntryId: EntityId;
  source: 'owned' | 'global-reference';
}

export interface GlobalTrainingPlanLibraryExercisePreview {
  id: EntityId;
  name: string;
  type: ExerciseType;
}

export interface GlobalTrainingPlanLibraryWorkoutPreview {
  exerciseCount: number;
  exercises: readonly GlobalTrainingPlanLibraryExercisePreview[];
  hiddenExerciseCount: number;
  id: EntityId;
  name: string;
}

export interface GlobalTrainingPlanLibraryItem extends TrainingPlanSummary {
  cloneBlocked: boolean;
  exerciseCount: number;
  referenced: boolean;
  hiddenWorkoutCount: number;
  workouts: readonly GlobalTrainingPlanLibraryWorkoutPreview[];
  workoutCount: number;
}

export interface TrainingPlanWorkoutSummary {
  id: EntityId;
  name: string;
  exerciseCount: number;
}

export interface TrainingPlanDetails extends TrainingPlanSummary {
  workouts: readonly TrainingPlanWorkoutSummary[];
}

export const BODY_AREAS = [
  'stretching',
  'abdomen',
  'quadriceps',
  'mobility',
  'other',
  'chest',
  'shoulder',
  'triceps',
  'back',
  'biceps',
  'lower-back',
  'glutes',
  'calf',
  'adductor',
  'hamstrings',
  'cardio',
] as const;

export type BodyArea = (typeof BODY_AREAS)[number];

interface NamedExercise {
  id: EntityId;
  name: string;
  bodyArea: BodyArea;
}

interface SetsExercise extends NamedExercise {
  restSeconds: number;
  sets: number;
  repetitions: number;
}

export interface YoutubeShortExercise extends SetsExercise {
  type: 'youtube-short';
  youtubeId: string;
}

export interface ExerciseImage {
  thumbnailUrl: string;
  displayUrl: string;
  signedUrlExpiresAt: string;
}

export interface ImageExercise extends SetsExercise {
  type: 'image';
  image: ExerciseImage | null;
}

export interface YoutubeLongExercise extends NamedExercise {
  type: 'youtube-long';
  youtubeId: string;
}

export interface PauseExercise {
  id: EntityId;
  type: 'pause';
  restSeconds: number;
}

export interface DurationExercise extends NamedExercise {
  type: 'duration';
  durationMinutes: number;
  instructions?: string;
  youtubeId?: string;
}

export type Exercise =
  | YoutubeShortExercise
  | ImageExercise
  | YoutubeLongExercise
  | PauseExercise
  | DurationExercise;

export type ExerciseType = Exercise['type'];

export type TrainingPlanAssistantStatus =
  'collecting' | 'clarifying' | 'ready' | 'generating' | 'preview' | 'blocked';

export type TrainingPlanAssistantScreeningOutcome =
  | 'apto_para_fluxo_geral'
  | 'precisa_esclarecimento'
  | 'requer_avaliacao_profissional'
  | 'emergencia'
  | null;

export interface TrainingPlanAssistantMessage {
  id: EntityId;
  role: 'assistant' | 'person';
  text: string;
  createdAt: Timestamp;
}

export interface TrainingPlanAssistantAnswerOption {
  label: string;
  value: string;
}

export type TrainingPlanAssistantDraftExercise = { catalogKey: string } & (
  Omit<YoutubeShortExercise, 'id'> | Omit<DurationExercise, 'id'>
);

export interface TrainingPlanAssistantDraftWorkout {
  name: string;
  estimatedDurationMinutes: number;
  exercises: readonly TrainingPlanAssistantDraftExercise[];
}

export interface TrainingPlanAssistantDraft {
  planName: string;
  description: string;
  workouts: readonly TrainingPlanAssistantDraftWorkout[];
}

export interface TrainingPlanAssistantSession {
  id: EntityId;
  version: number;
  status: TrainingPlanAssistantStatus;
  messages: readonly TrainingPlanAssistantMessage[];
  currentPrompt: string | null;
  availableAnswers: readonly TrainingPlanAssistantAnswerOption[];
  screeningOutcome: TrainingPlanAssistantScreeningOutcome;
  draft: TrainingPlanAssistantDraft | null;
  noticeVersion: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface TrainingPlanWorkoutDetails extends Entity {
  name: string;
  version: number;
  trainingPlan: Pick<TrainingPlanSummary, 'id' | 'name'>;
  exercises: readonly Exercise[];
}

export interface GlobalTrainingPlanWorkoutDetails extends TrainingPlanWorkoutDetails {
  usage: GlobalTrainingPlanUsage;
}

export type TrainingPlanSource = 'global-reference' | 'owned';

export type TrainingWorkoutIndicator = 'current' | 'in-progress' | null;

export type TrainingWorkoutMedia =
  | {
      type: 'image';
      image: ExerciseImage;
    }
  | {
      type: 'youtube-long' | 'youtube-short';
      youtubeId: string;
    };

export interface TrainingWorkoutCard {
  bodyAreas: readonly BodyArea[];
  id: EntityId;
  indicator: TrainingWorkoutIndicator;
  media: TrainingWorkoutMedia | null;
  name: string;
}

export interface TrainingPlanExecutionSummary {
  catalogEntryId: EntityId;
  id: EntityId;
  name: string;
  source: TrainingPlanSource;
  workoutCount: number;
}

export interface TrainingOfflineValidity {
  expiresAt: Timestamp;
  validatedAt: Timestamp;
}

export interface TrainingOfflinePreparation {
  plan: TrainingPlanExecutionSummary;
  workoutIds: readonly EntityId[];
}

export interface TrainingOverview {
  offlinePreparation: TrainingOfflinePreparation | null;
  offlineValidity: TrainingOfflineValidity | null;
  plan: TrainingPlanExecutionSummary | null;
  workouts: readonly TrainingWorkoutCard[];
}

export interface TrainingPreviewImage extends ExerciseImage {
  offlineMediaId: string;
}

export type TrainingExercisePreview =
  | (YoutubeShortExercise & {
      lastLoadsKg: readonly (number | null)[];
    })
  | (Omit<ImageExercise, 'image'> & {
      image: TrainingPreviewImage | null;
      lastLoadsKg: readonly (number | null)[];
    })
  | YoutubeLongExercise
  | PauseExercise
  | DurationExercise;

export interface TrainingWorkoutPreview {
  exercises: readonly TrainingExercisePreview[];
  plan: TrainingPlanExecutionSummary;
  workout: Pick<TrainingPlanWorkoutDetails, 'id' | 'name'>;
}

export interface TrainingSeriesExecution {
  completedAt: Timestamp | null;
  loadKg: number | null;
  number: number;
  repetitions: number;
}

interface TrainingExecutionState {
  completedAt: Timestamp | null;
}

export type TrainingExerciseExecution =
  | (YoutubeShortExercise &
      TrainingExecutionState & {
        series: readonly TrainingSeriesExecution[];
      })
  | (ImageExercise &
      TrainingExecutionState & {
        series: readonly TrainingSeriesExecution[];
      })
  | (YoutubeLongExercise & TrainingExecutionState)
  | (PauseExercise & TrainingExecutionState)
  | (DurationExercise & TrainingExecutionState);

export type TrainingTimerKind = 'duration' | 'pause' | 'series-rest';

export interface TrainingTimer {
  endsAt: Timestamp;
  exerciseId: EntityId;
  kind: TrainingTimerKind;
  seriesNumber?: number;
  startedAt: Timestamp;
}

export interface TrainingSession {
  activeTimer: TrainingTimer | null;
  exercises: readonly TrainingExerciseExecution[];
  expiresAt: Timestamp;
  id: EntityId;
  plan: TrainingPlanExecutionSummary;
  serverNow: Timestamp;
  startedAt: Timestamp;
  version: number;
  workout: Pick<TrainingPlanWorkoutDetails, 'id' | 'name'>;
}

export interface OfflineTrainingSnapshotPlanWorkoutV1 {
  bodyAreas: readonly BodyArea[];
  id: EntityId;
  name: string;
}

export interface OfflineTrainingSnapshotPlanV1 {
  catalogEntryId: EntityId;
  name: string;
  planId: EntityId;
  source: TrainingPlanSource;
  workouts: readonly OfflineTrainingSnapshotPlanWorkoutV1[];
}

export interface OfflineTrainingSnapshotSeriesV1 {
  completedAt: Timestamp | null;
  loadKg: number | null;
  number: number;
  repetitions: number;
}

interface OfflineTrainingSnapshotExerciseStateV1 {
  completedAt: Timestamp | null;
}

export type OfflineTrainingSnapshotExerciseV1 =
  | (YoutubeShortExercise &
      OfflineTrainingSnapshotExerciseStateV1 & {
        series: readonly OfflineTrainingSnapshotSeriesV1[];
      })
  | (Omit<ImageExercise, 'image'> &
      OfflineTrainingSnapshotExerciseStateV1 & {
        series: readonly OfflineTrainingSnapshotSeriesV1[];
      })
  | (YoutubeLongExercise & OfflineTrainingSnapshotExerciseStateV1)
  | (PauseExercise & OfflineTrainingSnapshotExerciseStateV1)
  | (DurationExercise & OfflineTrainingSnapshotExerciseStateV1);

export interface OfflineTrainingSnapshotWorkoutV1 {
  exercises: readonly OfflineTrainingSnapshotExerciseV1[];
  id: EntityId;
  name: string;
}

export interface OfflineTrainingSnapshotTimerV1 {
  durationSeconds: number;
  exerciseId: EntityId;
  kind: TrainingTimerKind;
  seriesNumber?: number;
  startedAt: Timestamp;
}

export interface OfflineTrainingSnapshotV1 {
  activeTimer: OfflineTrainingSnapshotTimerV1 | null;
  plan: OfflineTrainingSnapshotPlanV1;
  startedAt: Timestamp;
  workout: OfflineTrainingSnapshotWorkoutV1;
}

export interface TrainingWeekDay {
  completed: boolean;
  date: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export interface WorkoutExecutionSummary extends Entity {
  bodyAreas: readonly BodyArea[];
  completedAt: Timestamp;
  completedExerciseCount: number;
  durationSeconds: number;
  fullCompletion: boolean;
  planName: string;
  totalExerciseCount: number;
  totalLoadKg: number;
  trainingPlanId: EntityId;
  week: {
    completedWorkoutCount: number;
    days: readonly TrainingWeekDay[];
    workoutCount: number;
  };
  workoutId: EntityId;
  workoutName: string;
}
