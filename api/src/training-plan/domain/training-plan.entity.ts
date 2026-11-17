import type {
  Exercise,
  ExerciseImage,
  ExerciseType,
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutDetails,
  TrainingPlanWorkoutSummary,
  UpdateExerciseRequest,
} from '@dall-fit/types';

export interface TrainingPlanEntity extends TrainingPlanDetails {
  ownerPersonId: string | null;
}

export interface NewTrainingPlan {
  ownerPersonId: string | null;
  name: string;
  description: string;
}

export interface CompleteTrainingPlanInput extends NewTrainingPlan {
  id: string;
  workouts: readonly {
    id: string;
    name: string;
    exercises: readonly StoredExercise[];
  }[];
}

export interface TrainingPlanAccessScope {
  ownerPersonId: string | null;
}

export interface TrainingPlanChanges {
  name?: string;
  description?: string;
}

export interface TrainingPlanPage {
  data: readonly TrainingPlanSummary[];
  total: number;
}

export interface StoredImageVariant {
  etag?: string;
  key: string;
  width: number;
  height: number;
}

export interface StoredExerciseImage {
  thumbnail: StoredImageVariant;
  display: StoredImageVariant;
}

export interface StoredImageExercise extends Omit<
  Extract<Exercise, { type: 'image' }>,
  'image'
> {
  image: StoredExerciseImage | null;
}

export type StoredExercise =
  Exclude<Exercise, { type: 'image' }> | StoredImageExercise;

export interface WorkoutAggregate extends Omit<
  TrainingPlanWorkoutDetails,
  'exercises'
> {
  exercises: readonly StoredExercise[];
}

export type NewWorkout = Pick<
  WorkoutAggregate,
  'id' | 'name' | 'exercises' | 'createdAt' | 'updatedAt'
>;

export interface TrainingPlanExecutionTree extends Omit<
  TrainingPlanEntity,
  'workouts'
> {
  workouts: readonly WorkoutAggregate[];
}

export type TargetState = {
  bsonSize?: number;
  exerciseExists: boolean;
  exerciseImage?: StoredExerciseImage | null;
  exerciseType?: ExerciseType;
  trainingPlanExists: boolean;
  version?: number;
  workoutExists: boolean;
  workoutCount?: number;
  exerciseCount?: number;
  maxExerciseCount?: number;
};

export interface VersionedResult<T> {
  data: T;
  version: number;
}

export interface WorkoutNameResult {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ImageWriteInput {
  image: StoredExerciseImage | null;
}

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export type ExerciseChanges = UpdateExerciseRequest;

export type {
  Exercise,
  ExerciseImage,
  ExerciseType,
  TrainingPlanWorkoutSummary,
};
