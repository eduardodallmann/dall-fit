import { Injectable, Logger } from '@nestjs/common';

import type { CreateExerciseResponse, ExerciseType } from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class CreateTrainingPlanExerciseCommand {
  private readonly logger = new Logger(CreateTrainingPlanExerciseCommand.name);
  constructor(private readonly service: TrainingPlanService) {}
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
    const response = {
      response: { data: result.data },
      version: result.version,
    };
    return response;
  }
}
