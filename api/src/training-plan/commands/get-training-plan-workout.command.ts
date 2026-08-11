import { Injectable, Logger } from '@nestjs/common';

import type { TrainingPlanWorkoutDetailsResponse } from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class GetTrainingPlanWorkoutCommand {
  private readonly logger = new Logger(GetTrainingPlanWorkoutCommand.name);
  constructor(private readonly service: TrainingPlanService) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<TrainingPlanWorkoutDetailsResponse> {
    this.logger.log('GetTrainingPlanWorkoutCommand -> execute -> params:', {
      params: { trainingPlanId, workoutId },
    });
    const data = await this.service.getWorkout(trainingPlanId, workoutId);
    this.logger.log(
      'GetTrainingPlanWorkoutCommand -> execute -> trainingPlanService return:',
      { data: { exerciseCount: data.exercises.length, version: data.version } },
    );
    const result = { data };
    this.logger.log('GetTrainingPlanWorkoutCommand -> execute -> return:', {
      data: { trainingPlanId, workoutId },
    });
    return result;
  }
}
