import type { ExerciseLibrarySelection } from '@dall-fit/types';

import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';

export interface ExerciseLibraryCandidate extends Omit<
  ExerciseLibrarySelection,
  'groupId'
> {
  exercise: StoredExercise;
}

export function normalizeExerciseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

export function exerciseGroupId(exercise: StoredExercise): string {
  return exercise.type === 'pause'
    ? 'pause'
    : `name:${normalizeExerciseName(exercise.name)}`;
}
