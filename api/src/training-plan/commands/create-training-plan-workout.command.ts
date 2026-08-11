import { Injectable, Logger } from '@nestjs/common';

import type { CreateTrainingPlanWorkoutResponse } from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class CreateTrainingPlanWorkoutCommand {
  private readonly logger = new Logger(CreateTrainingPlanWorkoutCommand.name);
  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(
    trainingPlanId: string,
    expectedVersion: number,
  ): Promise<{ response: CreateTrainingPlanWorkoutResponse; version: number }> {
    this.logger.log('CreateTrainingPlanWorkoutCommand -> execute -> params:', {
      params: { expectedVersion, trainingPlanId },
    });
    const serviceResult = await this.trainingPlanService.createWorkout(
      trainingPlanId,
      expectedVersion,
    );
    this.logger.log(
      'CreateTrainingPlanWorkoutCommand -> execute -> trainingPlanService return:',
      {
        data: {
          trainingPlanId,
          version: serviceResult.version,
          workoutId: serviceResult.data.id,
        },
      },
    );
    const result = {
      response: { data: serviceResult.data },
      version: serviceResult.version,
    };
    this.logger.log('CreateTrainingPlanWorkoutCommand -> execute -> return:', {
      data: {
        trainingPlanId,
        version: result.version,
        workoutId: result.response.data.id,
      },
    });
    return result;
  }
}
