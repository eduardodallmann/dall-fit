import { describe, expect, it, vi } from 'vitest';

import {
  createImageWriteUncertainException,
  createVersionConflictException,
} from '~/training-plan/errors/training-plan.errors';
import type { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import type { TrainingPlanService } from '~/training-plan/services/training-plan.service';

import { UploadTrainingPlanExerciseImageCommand } from './upload-training-plan-exercise-image.command';

describe('duration upload compensation', () => {
  it.each([false, true])(
    'preserves potentially committed assets when uncertain=%s',
    async (uncertain) => {
      const error = uncertain
        ? createImageWriteUncertainException()
        : createVersionConflictException();
      const service = {
        validateExerciseImageUpload: vi.fn().mockResolvedValue('duration'),
        commitExerciseImage: vi.fn().mockRejectedValue(error),
      };
      const image = {
        thumbnail: { key: 'new/thumb', width: 1, height: 1 },
        display: { key: 'new/display', width: 1, height: 1 },
      };
      const images = {
        processAndUpload: vi.fn().mockResolvedValue(image),
        createSignedImage: vi.fn().mockResolvedValue({}),
        deleteImages: vi.fn().mockResolvedValue(undefined),
      };
      const command = new UploadTrainingPlanExerciseImageCommand(
        service as unknown as TrainingPlanService,
        images as unknown as ExerciseImageService,
      );
      await expect(
        command.execute('plan', 'workout', 'duration', 0, {
          buffer: Buffer.from('fixture'),
          mimetype: 'image/png',
          size: 7,
          originalname: 'fixture.png',
        }),
      ).rejects.toBe(error);
      if (uncertain) expect(images.deleteImages).not.toHaveBeenCalled();
      else expect(images.deleteImages).toHaveBeenCalledWith([image]);
    },
  );
});
