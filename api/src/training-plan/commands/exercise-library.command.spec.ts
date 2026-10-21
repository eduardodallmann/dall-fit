import { describe, expect, it, vi } from 'vitest';

import { ExerciseLibraryCommand } from '~/training-plan/commands/exercise-library.command';
import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';
import { createVersionConflictException } from '~/training-plan/errors/training-plan.errors';
import type { ExerciseCopyService } from '~/training-plan/services/exercise-copy.service';
import type { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import type { ExerciseLibraryService } from '~/training-plan/services/exercise-library.service';
import type { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';

// Only the consumed service methods are doubles; the real command orchestrates each branch.
function setup() {
  const image: StoredExercise = {
    id: 'source',
    type: 'image',
    name: 'Supino',
    bodyArea: 'chest',
    sets: 3,
    repetitions: 12,
    restSeconds: 60,
    image: {
      thumbnail: { key: 'new/thumbnail', width: 160, height: 160 },
      display: { key: 'new/display', width: 1000, height: 1000 },
    },
  };
  const library = { resolve: vi.fn().mockResolvedValue([image]) };
  const personal = {
    resolveOwnedTrainingPlanId: vi.fn().mockResolvedValue('plan'),
  };
  const copying = {
    validate: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(1),
  };
  const images = {
    copyExercises: vi.fn().mockResolvedValue([image]),
    createSignedImage: vi.fn().mockResolvedValue({}),
    deleteImages: vi.fn().mockResolvedValue(undefined),
  };
  const command = new ExerciseLibraryCommand(
    library as unknown as ExerciseLibraryService,
    personal as unknown as PersonalTrainingPlanService,
    copying as unknown as ExerciseCopyService,
    images as unknown as ExerciseImageService,
  );
  const input = {
    selections: [
      {
        groupId: 'name:supino',
        trainingPlanId: 'source-plan',
        workoutId: 'source-workout',
        exerciseId: 'source',
        version: 0,
      },
    ],
  };
  return { command, input, library, personal, copying, images, image };
}

describe('ExerciseLibraryCommand copy', () => {
  it('allocates new identities and signs the complete batch before one commit', async () => {
    const { command, input, images, copying } = setup();
    const result = await command.copy('person', 'entry', 'workout', 0, input);
    const prepared: unknown = images.copyExercises.mock.calls[0]?.[0];
    expect(prepared).toEqual([expect.objectContaining({ type: 'image' })]);
    if (!Array.isArray(prepared)) throw new Error('Copy input missing.');
    const first: unknown = prepared[0];
    expect(
      typeof first === 'object' && first !== null && 'id' in first
        ? first.id
        : undefined,
    ).toMatch(/^[a-f0-9]{24}$/);
    expect(images.createSignedImage.mock.invocationCallOrder[0]).toBeLessThan(
      copying.commit.mock.invocationCallOrder[0],
    );
    expect(copying.commit).toHaveBeenCalledOnce();
    expect(result.version).toBe(1);
    expect(images.deleteImages).not.toHaveBeenCalled();
  });

  it('compensates after a known rejected CAS but retains assets after an uncertain commit', async () => {
    const known = setup();
    known.copying.commit.mockRejectedValue(createVersionConflictException());
    await expect(
      known.command.copy('person', 'entry', 'workout', 0, known.input),
    ).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_VERSION_CONFLICT' },
    });
    expect(known.images.deleteImages).toHaveBeenCalledWith([
      known.image.type === 'image' ? known.image.image : null,
    ]);
    const uncertain = setup();
    uncertain.copying.commit.mockRejectedValue(
      new Error('Connection lost after dispatch'),
    );
    await expect(
      uncertain.command.copy('person', 'entry', 'workout', 0, uncertain.input),
    ).rejects.toMatchObject({
      response: { code: 'EXERCISE_COPY_RESULT_UNCERTAIN' },
    });
    expect(uncertain.images.deleteImages).not.toHaveBeenCalled();
  });

  it('does not copy media when authorization or a source selection is rejected', async () => {
    const state = setup();
    state.library.resolve.mockRejectedValue(new Error('stale'));
    await expect(
      state.command.copy('person', 'entry', 'workout', 0, state.input),
    ).rejects.toThrow('stale');
    expect(state.images.copyExercises).not.toHaveBeenCalled();
    expect(state.copying.commit).not.toHaveBeenCalled();
  });
});
