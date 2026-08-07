import { Injectable, Logger } from '@nestjs/common';

import type {
  CreateTrainingPlanRequest,
  CreateTrainingPlanResponse,
} from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class CreateGlobalTrainingPlanCommand {
  private readonly logger = new Logger(CreateGlobalTrainingPlanCommand.name);

  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(
    input: CreateTrainingPlanRequest,
  ): Promise<CreateTrainingPlanResponse> {
    this.logger.log('CreateGlobalTrainingPlanCommand -> execute -> params:', {
      params: { fields: Object.keys(input) },
    });

    const serviceResult = await this.trainingPlanService.createGlobal(input);
    this.logger.log(
      'CreateGlobalTrainingPlanCommand -> execute -> trainingPlanService return:',
      { data: { trainingPlanId: serviceResult.id } },
    );

    const result = {
      data: {
        id: serviceResult.id,
        name: serviceResult.name,
        description: serviceResult.description,
        createdAt: serviceResult.createdAt,
        updatedAt: serviceResult.updatedAt,
      },
    };
    this.logger.log('CreateGlobalTrainingPlanCommand -> execute -> return:', {
      data: { trainingPlanId: result.data.id },
    });

    return result;
  }
}
