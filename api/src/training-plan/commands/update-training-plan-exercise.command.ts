import { Injectable, Logger } from '@nestjs/common';

import type {
  UpdateExerciseRequest,
  UpdateExerciseResponse,
} from '@dall-fit/types';

import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class UpdateTrainingPlanExerciseCommand {
  private readonly logger = new Logger(UpdateTrainingPlanExerciseCommand.name);
  constructor(private readonly service: TrainingPlanService) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    changes: UpdateExerciseRequest,
  ): Promise<{ response: UpdateExerciseResponse; version: number }> {
    this.logger.log('UpdateTrainingPlanExerciseCommand -> execute -> params:', {
      params: {
        exerciseId,
        expectedVersion,
        fields: Object.keys(changes),
        trainingPlanId,
        workoutId,
      },
    });
    const result = await this.service.updateExercise(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      changes,
    );
    this.logger.log(
      'UpdateTrainingPlanExerciseCommand -> execute -> trainingPlanService return:',
      { data: { exerciseId, version: result.version } },
    );
    const response = {
      response: { data: result.data },
      version: result.version,
    };
    return response;
  }
}
