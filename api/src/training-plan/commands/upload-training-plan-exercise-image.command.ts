import { Injectable, Logger } from '@nestjs/common';

import type { UpdateExerciseImageResponse } from '@dall-fit/types';

import type { UploadedImageFile } from '~/training-plan/domain/training-plan.entity';
import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class UploadTrainingPlanExerciseImageCommand {
  private readonly logger = new Logger(
    UploadTrainingPlanExerciseImageCommand.name,
  );
  constructor(
    private readonly service: TrainingPlanService,
    private readonly exerciseImageService: ExerciseImageService,
  ) {}
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
    await this.service.validateExerciseImageUpload(
      trainingPlanId,
      workoutId,
      exerciseId,
      expectedVersion,
    );
    this.logger.log(
      'UploadTrainingPlanExerciseImageCommand -> execute -> validation completed:',
      { data: { exerciseId, trainingPlanId, workoutId } },
    );
    const storedImage = await this.exerciseImageService.processAndUpload(file);
    this.logger.log(
      'UploadTrainingPlanExerciseImageCommand -> execute -> processAndUpload return:',
      { data: { uploadedVariants: 2 } },
    );
    let committed = false;
    try {
      const image =
        await this.exerciseImageService.createSignedImage(storedImage);
      this.logger.log(
        'UploadTrainingPlanExerciseImageCommand -> execute -> createSignedImage return:',
        { data: { signedVariants: 2 } },
      );
      const version = await this.service.commitExerciseImage(
        trainingPlanId,
        workoutId,
        exerciseId,
        expectedVersion,
        storedImage,
      );
      committed = true;
      this.logger.log(
        'UploadTrainingPlanExerciseImageCommand -> execute -> return:',
        { data: { version } },
      );
      const result = {
        response: { data: { image } },
        version,
      };
      return result;
    } finally {
      if (!committed) {
        await this.exerciseImageService.deleteImages([storedImage]);
        this.logger.warn(
          'UploadTrainingPlanExerciseImageCommand -> execute -> compensated branch:',
          { data: { uploadedVariants: 2 } },
        );
      }
    }
  }
}
