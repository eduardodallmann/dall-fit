import { describe, expect, it, vi } from 'vitest';

import { PersonalTrainingPlansCommand } from '~/training-plan/commands/personal-training-plans.command';
import type {
  NewWorkout,
  StoredExercise,
} from '~/training-plan/domain/training-plan.entity';
import { createVersionConflictException } from '~/training-plan/errors/training-plan.errors';
import type { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import type { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import type { TrainingPlanService } from '~/training-plan/services/training-plan.service';
import type { WorkoutDuplicationService } from '~/training-plan/services/workout-duplication.service';

function setup() {
  const image: StoredExercise = {
    id: 'exercise-copy',
    type: 'image',
    name: 'Supino',
    bodyArea: 'chest',
    sets: 3,
    repetitions: 10,
    restSeconds: 60,
    image: {
      thumbnail: { key: 'copy/thumbnail', width: 160, height: 160 },
      display: { key: 'copy/display', width: 640, height: 640 },
    },
  };
  const workout: NewWorkout = {
    id: 'copy',
    name: 'Treino (cópia)',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    exercises: [image],
  };
  const personal = {
    resolveOwnedTrainingPlanId: vi.fn().mockResolvedValue('plan'),
  };
  const images = {
    copyExercises: vi.fn().mockResolvedValue([image]),
    deleteImages: vi.fn().mockResolvedValue(undefined),
  };
  const duplication = {
    prepare: vi.fn().mockResolvedValue(workout),
    commit: vi.fn().mockResolvedValue({
      data: { id: 'copy', name: workout.name, exerciseCount: 1 },
      version: 4,
    }),
  };
  const command = new PersonalTrainingPlansCommand(
    personal as unknown as PersonalTrainingPlanService,
    {} as TrainingPlanService,
    images as unknown as ExerciseImageService,
    duplication as unknown as WorkoutDuplicationService,
  );
  return { command, personal, images, duplication, workout, image };
}

describe('PersonalTrainingPlansCommand duplication', () => {
  it('resolves ownership before copying images and commits the complete workout once', async () => {
    const { command, personal, images, duplication, workout } = setup();
    const result = await command.duplicateWorkout(
      'person',
      'entry',
      'source',
      3,
    );
    expect(personal.resolveOwnedTrainingPlanId).toHaveBeenCalledWith(
      'person',
      'entry',
    );
    expect(images.copyExercises).toHaveBeenCalledWith(
      workout.exercises,
      expect.any(AbortSignal),
    );
    expect(images.copyExercises.mock.invocationCallOrder[0]).toBeLessThan(
      duplication.commit.mock.invocationCallOrder[0],
    );
    expect(duplication.commit).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      response: { data: { id: 'copy', exerciseCount: 1 } },
      version: 4,
    });
    expect(images.deleteImages).not.toHaveBeenCalled();
  });

  it('does not copy anything after an authorization rejection', async () => {
    const state = setup();
    state.personal.resolveOwnedTrainingPlanId.mockRejectedValue(
      new Error('read-only'),
    );
    await expect(
      state.command.duplicateWorkout('person', 'entry', 'source', 3),
    ).rejects.toThrow('read-only');
    expect(state.images.copyExercises).not.toHaveBeenCalled();
    expect(state.duplication.commit).not.toHaveBeenCalled();
  });

  it('compensates copied media on a known rejection and retains it when commit is uncertain', async () => {
    const known = setup();
    known.duplication.commit.mockRejectedValue(
      createVersionConflictException(),
    );
    await expect(
      known.command.duplicateWorkout('person', 'entry', 'source', 3),
    ).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_VERSION_CONFLICT' },
    });
    expect(known.images.deleteImages).toHaveBeenCalledWith([
      known.image.type === 'image' ? known.image.image : null,
    ]);
    const uncertain = setup();
    uncertain.duplication.commit.mockRejectedValue(
      new Error('Connection lost after dispatch'),
    );
    await expect(
      uncertain.command.duplicateWorkout('person', 'entry', 'source', 3),
    ).rejects.toMatchObject({
      response: { code: 'WORKOUT_DUPLICATION_RESULT_UNCERTAIN' },
    });
    expect(uncertain.images.deleteImages).not.toHaveBeenCalled();
  });
});
