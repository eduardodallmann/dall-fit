import type { Exercise, ExerciseLibraryItem } from '@dall-fit/types';

import { trainingPlanWorkoutFixture } from '~/mocks/fixtures/training-plans';

const normalize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();

export function exerciseLibraryFixtures(
  version = 0,
): readonly ExerciseLibraryItem[] {
  const exercises: Exercise[] = [
    ...trainingPlanWorkoutFixture.exercises,
    ...Array.from({ length: 21 }, (_, index): Exercise => ({
      id: `64b000000000000000000${String(300 + index).padStart(3, '0')}`,
      type: 'duration',
      name: `Exercício ${String(index + 1).padStart(2, '0')}`,
      bodyArea: index % 2 === 0 ? 'back' : 'chest',
      durationMinutes: 5,
    })),
  ];
  return exercises
    .map((exercise) => ({
      groupId:
        exercise.type === 'pause'
          ? 'pause'
          : `name:${normalize(exercise.name)}`,
      trainingPlanId: '64b000000000000000000001',
      workoutId: trainingPlanWorkoutFixture.id,
      exerciseId: exercise.id,
      version,
      exercise,
    }))
    .sort((a, b) =>
      (a.exercise.type === 'pause' ? 'Pausa' : a.exercise.name).localeCompare(
        b.exercise.type === 'pause' ? 'Pausa' : b.exercise.name,
        'pt',
      ),
    );
}
