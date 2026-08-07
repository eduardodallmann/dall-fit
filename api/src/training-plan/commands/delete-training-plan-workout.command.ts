import { Injectable, Logger } from '@nestjs/common';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class DeleteTrainingPlanWorkoutCommand {
  private readonly logger = new Logger(DeleteTrainingPlanWorkoutCommand.name);

  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  async execute(trainingPlanId: string, workoutId: string): Promise<void> {
    this.logger.log('DeleteTrainingPlanWorkoutCommand -> execute -> params:', {
      params: { trainingPlanId, workoutId },
    });

    await this.trainingPlanService.deleteWorkout(trainingPlanId, workoutId);
    this.logger.log(
      'DeleteTrainingPlanWorkoutCommand -> execute -> trainingPlanService completed:',
      { data: { trainingPlanId, workoutId } },
    );
    this.logger.log(
      'DeleteTrainingPlanWorkoutCommand -> execute -> completed:',
      {
        data: { trainingPlanId, workoutId },
      },
    );
  }
}
