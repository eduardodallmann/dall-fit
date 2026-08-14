import { Injectable, Logger } from '@nestjs/common';

import type { CreateExerciseResponse, ExerciseType } from '@dall-fit/types';

import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class CreateTrainingPlanExerciseCommand {
  private readonly logger = new Logger(CreateTrainingPlanExerciseCommand.name);
  constructor(
    private readonly service: TrainingPlanService,
    private readonly exerciseImageService: ExerciseImageService,
  ) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    type: ExerciseType,
  ): Promise<{ response: CreateExerciseResponse; version: number }> {
    this.logger.log('CreateTrainingPlanExerciseCommand -> execute -> params:', {
      params: { expectedVersion, trainingPlanId, type, workoutId },
    });
    const result = await this.service.createExercise(
      trainingPlanId,
      workoutId,
      expectedVersion,
      type,
    );
    this.logger.log(
      'CreateTrainingPlanExerciseCommand -> execute -> trainingPlanService return:',
      { data: { exerciseId: result.data.id, version: result.version } },
    );
    const exercise = await this.exerciseImageService.toPublicExercise(
      result.data,
    );
    this.logger.log(
      'CreateTrainingPlanExerciseCommand -> execute -> exerciseImageService return:',
      { data: { exerciseId: exercise.id } },
    );
    const response = {
      response: { data: exercise },
      version: result.version,
    };
    return response;
  }
}
