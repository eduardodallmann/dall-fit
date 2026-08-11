import { Injectable, Logger } from '@nestjs/common';

import type { UpdateExerciseImageResponse } from '@dall-fit/types';

import type { UploadedImageFile } from '~/training-plan/domain/training-plan.entity';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class UploadTrainingPlanExerciseImageCommand {
  private readonly logger = new Logger(
    UploadTrainingPlanExerciseImageCommand.name,
  );
  constructor(private readonly service: TrainingPlanService) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    file: UploadedImageFile,
  ): Promise<{ response: UpdateExerciseImageResponse; version: number }> {
    this.logger.log(
      'UploadTrainingPlanExerciseImageCommand -> execute -> params:',
      {
        params: {
          bytes: file.size,
          exerciseId,
          expectedVersion,
          trainingPlanId,
          workoutId,
        },
      },
    );
    const result = await this.service.uploadExerciseImage(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
      file,
    );
    this.logger.log(
      'UploadTrainingPlanExerciseImageCommand -> execute -> return:',
      { data: { version: result.version } },
    );
    const response = {
      response: { data: { image: result.data } },
      version: result.version,
    };
    return response;
  }
}
