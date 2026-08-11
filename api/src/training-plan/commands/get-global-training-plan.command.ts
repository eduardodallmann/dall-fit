import { Injectable, Logger } from '@nestjs/common';

import type { TrainingPlanDetailsResponse } from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class GetGlobalTrainingPlanCommand {
  private readonly logger = new Logger(GetGlobalTrainingPlanCommand.name);

  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(trainingPlanId: string): Promise<TrainingPlanDetailsResponse> {
    this.logger.log('GetGlobalTrainingPlanCommand -> execute -> params:', {
      params: { trainingPlanId },
    });

    const serviceResult =
      await this.trainingPlanService.getGlobal(trainingPlanId);
    this.logger.log(
      'GetGlobalTrainingPlanCommand -> execute -> trainingPlanService return:',
      {
        data: {
          trainingPlanId: serviceResult.id,
          workoutCount: serviceResult.workouts.length,
        },
      },
    );

    const result = {
      data: {
        id: serviceResult.id,
        name: serviceResult.name,
        description: serviceResult.description,
        version: serviceResult.version,
        workouts: serviceResult.workouts,
        createdAt: serviceResult.createdAt,
        updatedAt: serviceResult.updatedAt,
      },
    };
    this.logger.log('GetGlobalTrainingPlanCommand -> execute -> return:', {
      data: {
        trainingPlanId: result.data.id,
        workoutCount: result.data.workouts.length,
      },
    });

    return result;
  }
}
