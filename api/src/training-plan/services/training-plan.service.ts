import { Injectable, Logger } from '@nestjs/common';

import type {
  CreateTrainingPlanRequest,
  TrainingPlanSummary,
  TrainingPlanWorkoutSummary,
  UpdateTrainingPlanRequest,
} from '@dall-fit/types';

import type {
  TrainingPlanEntity,
  TrainingPlanPage,
} from '~/training-plan/domain/training-plan.entity';
import {
  createTrainingPlanNotFoundException,
  createWorkoutNotFoundException,
} from '~/training-plan/errors/training-plan.errors';
import { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import {
  DEFAULT_WORKOUT_NAME,
  TRAINING_PLAN_PAGE_SIZE,
} from '~/training-plan/training-plan.constants';

@Injectable()
export class TrainingPlanService {
  private readonly logger = new Logger(TrainingPlanService.name);

  constructor(
    private readonly trainingPlanRepository: TrainingPlanRepository,
  ) {}

  async listGlobal(page: number): Promise<TrainingPlanPage> {
    this.logger.log('TrainingPlanService -> listGlobal -> params:', {
      params: { page, pageSize: TRAINING_PLAN_PAGE_SIZE },
    });

    const repositoryResult = await this.trainingPlanRepository.listGlobal(
      page,
      TRAINING_PLAN_PAGE_SIZE,
    );
    this.logger.log(
      'TrainingPlanService -> listGlobal -> trainingPlanRepository return:',
      {
        data: {
          count: repositoryResult.data.length,
          total: repositoryResult.total,
        },
      },
    );

    const result = repositoryResult;
    this.logger.log('TrainingPlanService -> listGlobal -> return:', {
      data: { count: result.data.length, total: result.total },
    });

    return result;
  }

  async createGlobal(
    input: CreateTrainingPlanRequest,
  ): Promise<TrainingPlanEntity> {
    this.logger.log('TrainingPlanService -> createGlobal -> params:', {
      params: { fields: Object.keys(input), ownerIsGlobal: true },
    });

    const plan = { ...input, ownerPersonId: null };
    this.logger.log('TrainingPlanService -> createGlobal -> entity prepared:', {
      data: { fields: Object.keys(plan), ownerIsGlobal: true },
    });

    const repositoryResult = await this.trainingPlanRepository.create(plan);
    this.logger.log(
      'TrainingPlanService -> createGlobal -> trainingPlanRepository return:',
      { data: { trainingPlanId: repositoryResult.id } },
    );

    const result = repositoryResult;
    this.logger.log('TrainingPlanService -> createGlobal -> return:', {
      data: { trainingPlanId: result.id },
    });

    return result;
  }

  async getGlobal(trainingPlanId: string): Promise<TrainingPlanEntity> {
    this.logger.log('TrainingPlanService -> getGlobal -> params:', {
      params: { trainingPlanId },
    });

    const repositoryResult =
      await this.trainingPlanRepository.findGlobalById(trainingPlanId);
    this.logger.log(
      'TrainingPlanService -> getGlobal -> trainingPlanRepository return:',
      { data: { found: repositoryResult !== null, trainingPlanId } },
    );

    if (repositoryResult === null) {
      this.logger.warn(
        'TrainingPlanService -> getGlobal -> trainingPlanNotFound error:',
        { data: { code: 'TRAINING_PLAN_NOT_FOUND', trainingPlanId } },
      );
      throw createTrainingPlanNotFoundException();
    }

    const result = repositoryResult;
    this.logger.log('TrainingPlanService -> getGlobal -> return:', {
      data: { trainingPlanId: result.id },
    });

    return result;
  }

  async updateGlobal(
    trainingPlanId: string,
    changes: UpdateTrainingPlanRequest,
  ): Promise<TrainingPlanSummary> {
    this.logger.log('TrainingPlanService -> updateGlobal -> params:', {
      params: { fields: Object.keys(changes), trainingPlanId },
    });

    const repositoryResult = await this.trainingPlanRepository.updateGlobal(
      trainingPlanId,
      changes,
    );
    this.logger.log(
      'TrainingPlanService -> updateGlobal -> trainingPlanRepository return:',
      { data: { found: repositoryResult !== null, trainingPlanId } },
    );

    if (repositoryResult === null) {
      this.logger.warn(
        'TrainingPlanService -> updateGlobal -> trainingPlanNotFound error:',
        { data: { code: 'TRAINING_PLAN_NOT_FOUND', trainingPlanId } },
      );
      throw createTrainingPlanNotFoundException();
    }

    const result = this.toSummary(repositoryResult);
    this.logger.log('TrainingPlanService -> updateGlobal -> return:', {
      data: { trainingPlanId: result.id },
    });

    return result;
  }

  async deleteGlobal(trainingPlanId: string): Promise<void> {
    this.logger.log('TrainingPlanService -> deleteGlobal -> params:', {
      params: { trainingPlanId },
    });

    const deleted =
      await this.trainingPlanRepository.deleteGlobal(trainingPlanId);
    this.logger.log(
      'TrainingPlanService -> deleteGlobal -> trainingPlanRepository return:',
      { data: { deleted, trainingPlanId } },
    );

    if (!deleted) {
      this.logger.warn(
        'TrainingPlanService -> deleteGlobal -> trainingPlanNotFound error:',
        { data: { code: 'TRAINING_PLAN_NOT_FOUND', trainingPlanId } },
      );
      throw createTrainingPlanNotFoundException();
    }

    this.logger.log('TrainingPlanService -> deleteGlobal -> completed:', {
      data: { deleted: true, trainingPlanId },
    });
  }

  async createWorkout(
    trainingPlanId: string,
  ): Promise<TrainingPlanWorkoutSummary> {
    this.logger.log('TrainingPlanService -> createWorkout -> params:', {
      params: { trainingPlanId },
    });

    const repositoryResult = await this.trainingPlanRepository.createWorkout(
      trainingPlanId,
      DEFAULT_WORKOUT_NAME,
    );
    this.logger.log(
      'TrainingPlanService -> createWorkout -> trainingPlanRepository return:',
      {
        data: {
          created: repositoryResult !== null,
          trainingPlanId,
          workoutId: repositoryResult?.id,
        },
      },
    );

    if (repositoryResult === null) {
      this.logger.warn(
        'TrainingPlanService -> createWorkout -> trainingPlanNotFound error:',
        { data: { code: 'TRAINING_PLAN_NOT_FOUND', trainingPlanId } },
      );
      throw createTrainingPlanNotFoundException();
    }

    const result = repositoryResult;
    this.logger.log('TrainingPlanService -> createWorkout -> return:', {
      data: { trainingPlanId, workoutId: result.id },
    });

    return result;
  }

  async deleteWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<void> {
    this.logger.log('TrainingPlanService -> deleteWorkout -> params:', {
      params: { trainingPlanId, workoutId },
    });

    const repositoryResult = await this.trainingPlanRepository.deleteWorkout(
      trainingPlanId,
      workoutId,
    );
    this.logger.log(
      'TrainingPlanService -> deleteWorkout -> trainingPlanRepository return:',
      { data: { repositoryResult, trainingPlanId, workoutId } },
    );

    if (repositoryResult === 'training-plan-not-found') {
      this.logger.warn(
        'TrainingPlanService -> deleteWorkout -> trainingPlanNotFound error:',
        {
          data: {
            code: 'TRAINING_PLAN_NOT_FOUND',
            trainingPlanId,
            workoutId,
          },
        },
      );
      throw createTrainingPlanNotFoundException();
    }

    if (repositoryResult === 'workout-not-found') {
      this.logger.warn(
        'TrainingPlanService -> deleteWorkout -> workoutNotFound error:',
        {
          data: { code: 'WORKOUT_NOT_FOUND', trainingPlanId, workoutId },
        },
      );
      throw createWorkoutNotFoundException();
    }

    this.logger.log('TrainingPlanService -> deleteWorkout -> completed:', {
      data: { deleted: true, trainingPlanId, workoutId },
    });
  }

  private toSummary(plan: TrainingPlanEntity): TrainingPlanSummary {
    this.logger.log('TrainingPlanService -> toSummary -> params:', {
      params: { trainingPlanId: plan.id },
    });

    const result = {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
    this.logger.log('TrainingPlanService -> toSummary -> return:', {
      data: { trainingPlanId: result.id },
    });

    return result;
  }
}
