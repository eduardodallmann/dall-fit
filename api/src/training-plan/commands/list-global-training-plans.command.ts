import { Injectable, Logger } from '@nestjs/common';

import type { GlobalTrainingPlanCollectionResponse } from '@dall-fit/types';

import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';
import { TRAINING_PLAN_PAGE_SIZE } from '~/training-plan/training-plan.constants';

@Injectable()
export class ListGlobalTrainingPlansCommand {
  private readonly logger = new Logger(ListGlobalTrainingPlansCommand.name);

  constructor(
    private readonly trainingPlanService: TrainingPlanService,
    private readonly personalTrainingPlanService: PersonalTrainingPlanService,
  ) {}

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

    const usage = await this.personalTrainingPlanService.usageForGlobals(
      serviceResult.data.map((plan) => plan.id),
    );
    const result = {
      data: serviceResult.data.map((plan) => ({
        ...plan,
        usage: usage.get(plan.id) ?? { activePeople: 0, linkedPeople: 0 },
      })),
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
