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
    expectedVersion: number,
    changes: UpdateTrainingPlanRequest,
  ): Promise<{ response: UpdateTrainingPlanResponse; version: number }> {
    this.logger.log('UpdateGlobalTrainingPlanCommand -> execute -> params:', {
      params: { expectedVersion, fields: Object.keys(changes), trainingPlanId },
    });
    const serviceResult = await this.trainingPlanService.updateGlobal(
      trainingPlanId,
      expectedVersion,
      changes,
    );
    this.logger.log(
      'UpdateGlobalTrainingPlanCommand -> execute -> trainingPlanService return:',
      { data: { trainingPlanId, version: serviceResult.version } },
    );
    const result = {
      response: { data: serviceResult.data },
      version: serviceResult.version,
    };
    this.logger.log('UpdateGlobalTrainingPlanCommand -> execute -> return:', {
      data: { trainingPlanId, version: result.version },
    });
    return result;
  }
}
