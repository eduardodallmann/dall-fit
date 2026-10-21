import { Injectable, Logger } from '@nestjs/common';

import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';
import {
  createExerciseLimitException,
  createTrainingPlanNotFoundException,
  createTrainingPlanSizeLimitException,
  createVersionConflictException,
  createWorkoutNotFoundException,
} from '~/training-plan/errors/training-plan.errors';
import { ExerciseLibraryRepository } from '~/training-plan/repositories/exercise-library.repository';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import { TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT } from '~/training-plan/training-plan.constants';

export interface ExerciseCopyTarget {
  personId: string;
  trainingPlanId: string;
  workoutId: string;
  version: number;
}

@Injectable()
export class ExerciseCopyService {
  private readonly logger = new Logger(ExerciseCopyService.name);
  constructor(
    private readonly plans: TrainingPlanRepository,
    private readonly library: ExerciseLibraryRepository,
  ) {}

  async validate(target: ExerciseCopyTarget, count: number): Promise<void> {
    this.logger.log('ExerciseCopyService -> validate -> params:', {
      params: { count, version: target.version },
    });
    const state = await this.plans.inspectTarget(
      target.trainingPlanId,
      target.workoutId,
      undefined,
      { ownerPersonId: target.personId },
    );
    this.logger.log('ExerciseCopyService -> validate -> plans return:', {
      data: {
        found: state.trainingPlanExists,
        version: state.version,
        exerciseCount: state.exerciseCount,
      },
    });
    let failure;
    if (!state.trainingPlanExists)
      failure = createTrainingPlanNotFoundException();
    else if (!state.workoutExists) failure = createWorkoutNotFoundException();
    else if (state.version !== target.version)
      failure = createVersionConflictException();
    else if ((state.exerciseCount ?? 0) + count > 50)
      failure = createExerciseLimitException();
    else if ((state.bsonSize ?? 0) >= TRAINING_PLAN_OPERATIONAL_SIZE_LIMIT)
      failure = createTrainingPlanSizeLimitException();
    if (failure !== undefined) {
      this.logger.warn('ExerciseCopyService -> validate -> rejected branch:', {
        data: { status: failure.getStatus() },
      });
      throw failure;
    }
    this.logger.log('ExerciseCopyService -> validate -> completed:', {
      data: { count },
    });
  }

  async commit(
    target: ExerciseCopyTarget,
    exercises: readonly StoredExercise[],
  ): Promise<number> {
    this.logger.log('ExerciseCopyService -> commit -> params:', {
      params: { count: exercises.length, version: target.version },
    });
    const appended = await this.library.append(
      target.personId,
      target.trainingPlanId,
      target.workoutId,
      target.version,
      exercises,
    );
    this.logger.log('ExerciseCopyService -> commit -> library return:', {
      data: { appended },
    });
    if (!appended) {
      this.logger.warn('ExerciseCopyService -> commit -> rejected branch:', {
        data: { appended: false },
      });
      await this.validate(target, exercises.length);
      throw createTrainingPlanSizeLimitException();
    }
    const result = target.version + 1;
    this.logger.log('ExerciseCopyService -> commit -> return:', {
      data: { version: result },
    });
    return result;
  }
}
