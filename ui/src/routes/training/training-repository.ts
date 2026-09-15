import { createContext, use } from 'react';

import type {
  TrainingOverview,
  TrainingSession,
  TrainingWorkoutPreview,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

export interface TrainingRepository {
  readonly source: 'native' | 'web';
  abandonSession(): Promise<void>;
  completeExercise(
    exerciseId: string,
    version: number,
  ): Promise<TrainingSession>;
  completeRemainingSeries(
    exerciseId: string,
    loadsKg: readonly (number | null)[],
    version: number,
  ): Promise<TrainingSession>;
  completeSeries(
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    version: number,
  ): Promise<TrainingSession>;
  completeSession(
    confirmIncomplete: boolean,
    timezone: string,
    version: number,
  ): Promise<WorkoutExecutionSummary | null>;
  getCompletion(
    executionId: string,
    signal?: AbortSignal,
  ): Promise<WorkoutExecutionSummary>;
  getOverview(signal?: AbortSignal): Promise<TrainingOverview>;
  getPreview(
    workoutId: string,
    signal?: AbortSignal,
  ): Promise<TrainingWorkoutPreview>;
  getSession(signal?: AbortSignal): Promise<TrainingSession>;
  resolveTimer(
    outcome: 'cancel' | 'finish' | 'skip',
    version: number,
  ): Promise<TrainingSession>;
  restartExercise(
    exerciseId: string,
    version: number,
  ): Promise<TrainingSession>;
  saveLoad(
    exerciseId: string,
    seriesNumber: number,
    loadKg: number | null,
    version: number,
  ): Promise<TrainingSession>;
  startSession(workoutId: string): Promise<TrainingSession>;
  startTimer(
    exerciseId: string,
    kind: 'duration' | 'pause',
    version: number,
  ): Promise<TrainingSession>;
}

export const TrainingRepositoryContext =
  createContext<TrainingRepository | null>(null);

export function useNativeTrainingRepository(): TrainingRepository | null {
  return use(TrainingRepositoryContext);
}
