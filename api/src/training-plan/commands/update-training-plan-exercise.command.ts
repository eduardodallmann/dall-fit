import { Injectable, Logger } from '@nestjs/common';

import type {
  UpdateExerciseRequest,
  UpdateExerciseResponse,
} from '@dall-fit/types';

import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class UpdateTrainingPlanExerciseCommand {
  private readonly logger = new Logger(UpdateTrainingPlanExerciseCommand.name);
  constructor(
    private readonly service: TrainingPlanService,
    private readonly exerciseImageService: ExerciseImageService,
  ) {}
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
    const exercise = await this.exerciseImageService.toPublicExercise(
      result.data,
    );
    this.logger.log(
      'UpdateTrainingPlanExerciseCommand -> execute -> exerciseImageService return:',
      { data: { exerciseId: exercise.id } },
    );
    const response = {
      response: { data: exercise },
      version: result.version,
    };
    return response;
  }
}
