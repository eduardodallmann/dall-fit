import { randomBytes } from 'node:crypto';

import { HttpException, Injectable, Logger } from '@nestjs/common';

import type {
  CopyExercisesRequest,
  CopyExercisesResponse,
  Exercise,
  ExerciseLibraryQuery,
  ExerciseLibraryResponse,
} from '@dall-fit/types';

import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';
import {
  createExerciseCopyUncertainException,
  createExerciseImageCopyFailedException,
} from '~/training-plan/errors/training-plan.errors';
import { ExerciseCopyService } from '~/training-plan/services/exercise-copy.service';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { ExerciseLibraryService } from '~/training-plan/services/exercise-library.service';
import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';

@Injectable()
export class ExerciseLibraryCommand {
  private readonly logger = new Logger(ExerciseLibraryCommand.name);
  constructor(
    private readonly library: ExerciseLibraryService,
    private readonly personal: PersonalTrainingPlanService,
    private readonly copying: ExerciseCopyService,
    private readonly images: ExerciseImageService,
  ) {}

  async list(query: ExerciseLibraryQuery): Promise<ExerciseLibraryResponse> {
    this.logger.log('ExerciseLibraryCommand -> list -> params:', {
      params: { page: query.page },
    });
    const page = await this.library.list(query);
    this.logger.log('ExerciseLibraryCommand -> list -> library return:', {
      data: { count: page.data.length, total: page.total },
    });
    const exercises = await this.images.hydrateExercises(
      page.data.map((item) => item.exercise),
    );
    this.logger.log('ExerciseLibraryCommand -> list -> images return:', {
      data: { count: exercises.length },
    });
    const result = {
      ...page,
      data: page.data.map((item, index) => ({
        ...item,
        exercise: exercises[index],
      })),
    };
    this.logger.log('ExerciseLibraryCommand -> list -> return:', {
      data: { count: result.data.length, total: result.total },
    });
    return result;
  }

  async copy(
    personId: string,
    catalogEntryId: string,
    workoutId: string,
    version: number,
    input: CopyExercisesRequest,
  ): Promise<{ response: CopyExercisesResponse; version: number }> {
    this.logger.log('ExerciseLibraryCommand -> copy -> params:', {
      params: { count: input.selections.length, version },
    });
    const trainingPlanId = await this.personal.resolveOwnedTrainingPlanId(
      personId,
      catalogEntryId,
    );
    this.logger.log('ExerciseLibraryCommand -> copy -> personal return:', {
      data: { resolved: true },
    });
    const target = { personId, trainingPlanId, workoutId, version };
    await this.copying.validate(target, input.selections.length);
    this.logger.log('ExerciseLibraryCommand -> copy -> validation completed:', {
      data: { valid: true },
    });
    const signal = AbortSignal.timeout(45_000);
    const captured = await this.library.resolve(input.selections);
    this.logger.log('ExerciseLibraryCommand -> copy -> library return:', {
      data: { count: captured.length },
    });
    const prepared = captured.map((exercise) => ({
      ...exercise,
      id: randomBytes(12).toString('hex'),
    }));
    let copied: readonly StoredExercise[] = [];
    let commitStarted = false;
    try {
      copied = await this.images.copyExercises(prepared, signal);
      this.logger.log(
        'ExerciseLibraryCommand -> copy -> copyExercises return:',
        { data: { count: copied.length } },
      );
      const data = await this.hydrateCopy(copied, signal);
      if (signal.aborted) throw createExerciseImageCopyFailedException();
      commitStarted = true;
      const committedVersion = await this.copying.commit(target, copied);
      const result = { response: { data }, version: committedVersion };
      this.logger.log('ExerciseLibraryCommand -> copy -> return:', {
        data: { count: data.length, version: committedVersion },
      });
      return result;
    } catch (error: unknown) {
      // A transport failure after dispatch is not proof that MongoDB did not commit.
      const knownRejection = error instanceof HttpException;
      if (!commitStarted || knownRejection) {
        this.logger.warn(
          'ExerciseLibraryCommand -> copy -> compensate branch:',
          { data: { count: copied.length } },
        );
        await this.images.deleteImages(
          copied.flatMap((exercise) =>
            exercise.type === 'image' && exercise.image !== null
              ? [exercise.image]
              : [],
          ),
        );
      } else {
        this.logger.warn(
          'ExerciseLibraryCommand -> copy -> uncertainCommit branch:',
          { data: { count: copied.length } },
        );
        throw createExerciseCopyUncertainException();
      }
      throw error;
    }
  }

  private async hydrateCopy(
    exercises: readonly StoredExercise[],
    signal: AbortSignal,
  ) {
    this.logger.log('ExerciseLibraryCommand -> hydrateCopy -> params:', {
      params: { count: exercises.length },
    });
    const result = new Array<Exercise>(exercises.length);
    let next = 0;
    const settled = await Promise.allSettled(
      Array.from({ length: Math.min(4, exercises.length) }, async () => {
        while (next < exercises.length) {
          const index = next++;
          const exercise = exercises[index];
          if (signal.aborted) throw createExerciseImageCopyFailedException();
          result[index] =
            exercise.type === 'image' && exercise.image !== null
              ? {
                  ...exercise,
                  image: await this.images.createSignedImage(
                    exercise.image,
                    Date.now() + 15 * 60_000,
                    signal,
                  ),
                }
              : (exercise as Exercise);
        }
      }),
    );
    const failure = settled.find((item) => item.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    this.logger.log('ExerciseLibraryCommand -> hydrateCopy -> return:', {
      data: { count: result.length },
    });
    return result;
  }
}
