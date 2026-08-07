import { Injectable, Logger } from '@nestjs/common';

import type { GlobalTrainingPlanCollectionResponse } from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';
import { TRAINING_PLAN_PAGE_SIZE } from '~/training-plan/training-plan.constants';

@Injectable()
export class ListGlobalTrainingPlansCommand {
  private readonly logger = new Logger(ListGlobalTrainingPlansCommand.name);

  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(page: number): Promise<GlobalTrainingPlanCollectionResponse> {
    this.logger.log('ListGlobalTrainingPlansCommand -> execute -> params:', {
      params: { page },
    });

    const serviceResult = await this.trainingPlanService.listGlobal(page);
    this.logger.log(
      'ListGlobalTrainingPlansCommand -> execute -> trainingPlanService return:',
      {
        data: { count: serviceResult.data.length, total: serviceResult.total },
      },
    );

    const result = {
      data: serviceResult.data,
      page,
      pageSize: TRAINING_PLAN_PAGE_SIZE,
      total: serviceResult.total,
    };
    this.logger.log('ListGlobalTrainingPlansCommand -> execute -> return:', {
      data: { count: result.data.length, page, total: result.total },
    });

    return result;
  }
}
