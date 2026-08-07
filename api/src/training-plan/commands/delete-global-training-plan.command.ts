import { Injectable, Logger } from '@nestjs/common';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class DeleteGlobalTrainingPlanCommand {
  private readonly logger = new Logger(DeleteGlobalTrainingPlanCommand.name);

  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(trainingPlanId: string): Promise<void> {
    this.logger.log('DeleteGlobalTrainingPlanCommand -> execute -> params:', {
      params: { trainingPlanId },
    });

    await this.trainingPlanService.deleteGlobal(trainingPlanId);
    this.logger.log(
      'DeleteGlobalTrainingPlanCommand -> execute -> trainingPlanService completed:',
      { data: { trainingPlanId } },
    );
    this.logger.log(
      'DeleteGlobalTrainingPlanCommand -> execute -> completed:',
      {
        data: { trainingPlanId },
      },
    );
  }
}
