import { Injectable, Logger } from '@nestjs/common';

import type { CreateTrainingPlanWorkoutResponse } from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class CreateTrainingPlanWorkoutCommand {
  private readonly logger = new Logger(CreateTrainingPlanWorkoutCommand.name);

  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(
    trainingPlanId: string,
  ): Promise<CreateTrainingPlanWorkoutResponse> {
    this.logger.log('CreateTrainingPlanWorkoutCommand -> execute -> params:', {
      params: { trainingPlanId },
    });

    const serviceResult =
      await this.trainingPlanService.createWorkout(trainingPlanId);
    this.logger.log(
      'CreateTrainingPlanWorkoutCommand -> execute -> trainingPlanService return:',
      {
        data: { trainingPlanId, workoutId: serviceResult.id },
      },
    );

    const result = { data: serviceResult };
    this.logger.log('CreateTrainingPlanWorkoutCommand -> execute -> return:', {
      data: { trainingPlanId, workoutId: result.data.id },
    });

    return result;
  }
}
