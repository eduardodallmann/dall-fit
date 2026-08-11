import { Injectable, Logger } from '@nestjs/common';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class DeleteTrainingPlanWorkoutCommand {
  private readonly logger = new Logger(DeleteTrainingPlanWorkoutCommand.name);
  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
  ): Promise<number> {
    this.logger.log('DeleteTrainingPlanWorkoutCommand -> execute -> params:', {
      params: { expectedVersion, trainingPlanId, workoutId },
    });
    const version = await this.trainingPlanService.deleteWorkout(
      trainingPlanId,
      workoutId,
      expectedVersion,
    );
    this.logger.log(
      'DeleteTrainingPlanWorkoutCommand -> execute -> trainingPlanService return:',
      { data: { trainingPlanId, version, workoutId } },
    );
    this.logger.log('DeleteTrainingPlanWorkoutCommand -> execute -> return:', {
      data: { trainingPlanId, version, workoutId },
    });
    return version;
  }
}
