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
}

export type Exercise =
  | YoutubeShortExercise
  | ImageExercise
  | YoutubeLongExercise
  | PauseExercise
  | DurationExercise;

export type ExerciseType = Exercise['type'];

export interface TrainingPlanWorkoutDetails extends Entity {
  name: string;
  version: number;
  trainingPlan: Pick<TrainingPlanSummary, 'id' | 'name'>;
  exercises: readonly Exercise[];
}
