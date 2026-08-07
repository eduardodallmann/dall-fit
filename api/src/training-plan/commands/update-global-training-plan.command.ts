import { Injectable, Logger } from '@nestjs/common';

import type {
  UpdateTrainingPlanRequest,
  UpdateTrainingPlanResponse,
} from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class UpdateGlobalTrainingPlanCommand {
  private readonly logger = new Logger(UpdateGlobalTrainingPlanCommand.name);

  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(
    trainingPlanId: string,
    changes: UpdateTrainingPlanRequest,
  ): Promise<UpdateTrainingPlanResponse> {
    this.logger.log('UpdateGlobalTrainingPlanCommand -> execute -> params:', {
      params: { fields: Object.keys(changes), trainingPlanId },
    });

    const serviceResult = await this.trainingPlanService.updateGlobal(
      trainingPlanId,
      changes,
    );
    this.logger.log(
      'UpdateGlobalTrainingPlanCommand -> execute -> trainingPlanService return:',
      { data: { trainingPlanId: serviceResult.id } },
    );

    const result = { data: serviceResult };
    this.logger.log('UpdateGlobalTrainingPlanCommand -> execute -> return:', {
      data: { trainingPlanId: result.data.id },
    });

    return result;
  }
}
