import { Injectable, Logger } from '@nestjs/common';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class RemoveTrainingPlanExerciseImageCommand {
  private readonly logger = new Logger(
    RemoveTrainingPlanExerciseImageCommand.name,
  );
  constructor(private readonly service: TrainingPlanService) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<number> {
    this.logger.log(
      'RemoveTrainingPlanExerciseImageCommand -> execute -> params:',
      { params: { exerciseId, expectedVersion, trainingPlanId, workoutId } },
    );
    const result = await this.service.removeExerciseImage(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
    );
    this.logger.log(
      'RemoveTrainingPlanExerciseImageCommand -> execute -> return:',
      { data: { version: result } },
    );
    return result;
  }
}
