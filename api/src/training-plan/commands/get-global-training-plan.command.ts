import { Injectable, Logger } from '@nestjs/common';

import type { GlobalTrainingPlanDetailsResponse } from '@dall-fit/types';

import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class GetGlobalTrainingPlanCommand {
  private readonly logger = new Logger(GetGlobalTrainingPlanCommand.name);

  constructor(
    private readonly trainingPlanService: TrainingPlanService,
    private readonly personalTrainingPlanService: PersonalTrainingPlanService,
  ) {}

  async execute(
    trainingPlanId: string,
  ): Promise<GlobalTrainingPlanDetailsResponse> {
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

    const usage =
      await this.personalTrainingPlanService.usageForGlobal(trainingPlanId);
    const result = {
      data: {
        id: serviceResult.id,
        name: serviceResult.name,
        description: serviceResult.description,
        version: serviceResult.version,
        workouts: serviceResult.workouts,
        createdAt: serviceResult.createdAt,
        updatedAt: serviceResult.updatedAt,
        usage,
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
