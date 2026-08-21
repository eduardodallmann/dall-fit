import { Injectable, Logger } from '@nestjs/common';

import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class DeleteGlobalTrainingPlanCommand {
  private readonly logger = new Logger(DeleteGlobalTrainingPlanCommand.name);
  constructor(
    private readonly trainingPlanService: TrainingPlanService,
    private readonly personalTrainingPlanService: PersonalTrainingPlanService,
  ) {}

  async execute(
    trainingPlanId: string,
    expectedVersion: number,
  ): Promise<void> {
    this.logger.log('DeleteGlobalTrainingPlanCommand -> execute -> params:', {
      params: { expectedVersion, trainingPlanId },
    });
    const retainedImageKeys =
      await this.personalTrainingPlanService.retainedSourceImageKeys(
        trainingPlanId,
      );
    await this.trainingPlanService.deleteGlobal(
      trainingPlanId,
      expectedVersion,
      retainedImageKeys,
    );
    await this.personalTrainingPlanService.cleanupGlobalReferences(
      trainingPlanId,
    );
    this.logger.log(
      'DeleteGlobalTrainingPlanCommand -> execute -> trainingPlanService completed:',
      { data: { trainingPlanId } },
    );
    this.logger.log(
      'DeleteGlobalTrainingPlanCommand -> execute -> completed:',
      { data: { trainingPlanId } },
    );
  }
}
