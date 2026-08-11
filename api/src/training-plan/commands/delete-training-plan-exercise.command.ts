import { Injectable, Logger } from '@nestjs/common';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class DeleteTrainingPlanExerciseCommand {
  private readonly logger = new Logger(DeleteTrainingPlanExerciseCommand.name);
  constructor(private readonly service: TrainingPlanService) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<number> {
    this.logger.log('DeleteTrainingPlanExerciseCommand -> execute -> params:', {
      params: { exerciseId, expectedVersion, trainingPlanId, workoutId },
    });
    const result = await this.service.deleteExercise(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
    );
    this.logger.log('DeleteTrainingPlanExerciseCommand -> execute -> return:', {
      data: { exerciseId, version: result },
    });
    return result;
  }
}
