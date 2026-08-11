import { Injectable, Logger } from '@nestjs/common';

import type { UpdateTrainingPlanWorkoutResponse } from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class UpdateTrainingPlanWorkoutCommand {
  private readonly logger = new Logger(UpdateTrainingPlanWorkoutCommand.name);
  constructor(private readonly service: TrainingPlanService) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    name: string,
  ): Promise<{ response: UpdateTrainingPlanWorkoutResponse; version: number }> {
    this.logger.log('UpdateTrainingPlanWorkoutCommand -> execute -> params:', {
      params: { expectedVersion, trainingPlanId, workoutId },
    });
    const result = await this.service.updateWorkoutName(
      trainingPlanId,
      workoutId,
      expectedVersion,
      name,
    );
    this.logger.log(
      'UpdateTrainingPlanWorkoutCommand -> execute -> trainingPlanService return:',
      { data: { version: result.version } },
    );
    const response = {
      response: { data: result.data },
      version: result.version,
    };
    return response;
  }
}
