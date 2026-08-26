import type {
  BodyArea,
  TrainingPlanExecutionSummary,
  TrainingPlanSource,
  TrainingTimer,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';

export interface StoredTrainingSeriesExecution {
  completedAt: string | null;
  loadKg: number | null;
  number: number;
  repetitions: number;
}

export type StoredTrainingExerciseExecution = StoredExercise & {
  completedAt: string | null;
  series?: readonly StoredTrainingSeriesExecution[];
};

export interface StoredTrainingWorkoutCard {
  bodyAreas: readonly BodyArea[];
  firstMediaExercise: StoredExercise | null;
  id: string;
  name: string;
}

export interface WorkoutSessionSnapshot {
  activeTimer: TrainingTimer | null;
  exercises: readonly StoredTrainingExerciseExecution[];
  expiresAt: string;
  id: string;
  personId: string;
  plan: TrainingPlanExecutionSummary;
  planWorkouts: readonly StoredTrainingWorkoutCard[];
  startedAt: string;
  version: number;
  workout: { id: string; name: string };
}

export interface NewWorkoutExecution {
  bodyAreas: readonly BodyArea[];
  catalogEntryId: string;
  completedAt: Date;
  completedExerciseCount: number;
  durationSeconds: number;
  fullCompletion: boolean;
  personId: string;
  planName: string;
  sessionId: string;
  source: TrainingPlanSource;
  startedAt: Date;
  timezone: string;
  totalExerciseCount: number;
  totalLoadKg: number;
  trainingPlanId: string;
  workoutCount: number;
  workoutId: string;
  workoutName: string;
}

export interface StoredWorkoutExecution extends NewWorkoutExecution {
  createdAt: Date;
  id: string;
  status: 'completed' | 'finalizing';
  updatedAt: Date;
}

export interface TrainingLoadProfile {
  exerciseId: string;
  loadsKg: readonly (number | null)[];
  workoutId: string;
}

export interface TrainingLoadProfileWrite extends TrainingLoadProfile {
  personId: string;
  sessionId: string;
  trainingPlanId: string;
}

export interface WorkoutExecutionWeekData {
  completedAt: Date;
}

export interface CompletionResult {
  response: WorkoutExecutionSummary;
  version: number;
}
