import { createHash } from 'node:crypto';

import { copy, del } from '@vercel/blob';

import { WorkflowLogger } from '../../core/logger';
import type { CopiedCloneImage, TrainingPlanCloneJob } from '../domain';

export class CloneBlobService {
  private readonly logger = new WorkflowLogger(CloneBlobService.name);

  async copyExerciseImage(
    job: TrainingPlanCloneJob,
    exerciseId: string,
  ): Promise<CopiedCloneImage> {
    this.logger.info('copyExerciseImage', 'params', {
      cloneJobId: job._id,
      exerciseId,
      generation: job.generation,
    });
    const exercise = job.snapshot.workouts
      .flatMap((workout) => workout.exercises)
      .find((candidate) => candidate.id === exerciseId);
    if (
      exercise?.type !== 'image' ||
      exercise.image === null ||
      exercise.image === undefined
    )
      throw new Error('Clone snapshot image was not found.');
    const imageAssetId = createHash('sha256')
      .update(`${job._id}:${exerciseId}`)
      .digest('hex')
      .slice(0, 24);
    const prefix = `exercise-images/${imageAssetId}`;
    const options = {
      abortSignal: AbortSignal.timeout(15_000),
      access: 'private' as const,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31_536_000,
      contentType: 'image/webp',
      storeId: this.storeId(),
    };
    const [thumbnail, display] = await Promise.all([
      copy(exercise.image.thumbnail.key, `${prefix}/thumbnail.webp`, {
        ...options,
        ifMatch: exercise.image.thumbnail.etag,
      }),
      copy(exercise.image.display.key, `${prefix}/display.webp`, {
        ...options,
        ifMatch: exercise.image.display.etag,
      }),
    ]);
    const result = {
      display: {
        height: exercise.image.display.height,
        key: display.pathname,
        width: exercise.image.display.width,
      },
      exerciseId,
      thumbnail: {
        height: exercise.image.thumbnail.height,
        key: thumbnail.pathname,
        width: exercise.image.thumbnail.width,
      },
    };
    this.logger.info('copyExerciseImage', 'return', {
      cloneJobId: job._id,
      exerciseId,
      variantCount: 2,
    });
    return result;
  }

  async deleteDestinations(keys: readonly string[]): Promise<void> {
    this.logger.info('deleteDestinations', 'params', { keyCount: keys.length });
    if (keys.length > 0)
      await del([...keys], {
        abortSignal: AbortSignal.timeout(15_000),
        storeId: this.storeId(),
      });
    this.logger.info('deleteDestinations', 'completed', {
      keyCount: keys.length,
    });
  }

  private storeId(): string {
    const result = process.env.BLOB_STORE_ID;
    if (result === undefined || result.length === 0)
      throw new Error('BLOB_STORE_ID is required.');
    return result;
  }
}
