import { Injectable, Logger } from '@nestjs/common';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class ReorderTrainingPlanExercisesCommand {
  private readonly logger = new Logger(
    ReorderTrainingPlanExercisesCommand.name,
  );
  constructor(private readonly service: TrainingPlanService) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exerciseIds: readonly string[],
  ): Promise<number> {
    this.logger.log(
      'ReorderTrainingPlanExercisesCommand -> execute -> params:',
      {
        params: {
          count: exerciseIds.length,
          expectedVersion,
          trainingPlanId,
          workoutId,
        },
      },
    );
    const result = await this.service.reorderExercises(
      trainingPlanId,
      workoutId,
      expectedVersion,
      exerciseIds,
    );
    this.logger.log(
      'ReorderTrainingPlanExercisesCommand -> execute -> return:',
      { data: { version: result } },
    );
    return result;
  }
}
