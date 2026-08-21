import { Injectable, Logger } from '@nestjs/common';

import type { GlobalTrainingPlanWorkoutDetailsResponse } from '@dall-fit/types';

import { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

@Injectable()
export class GetTrainingPlanWorkoutCommand {
  private readonly logger = new Logger(GetTrainingPlanWorkoutCommand.name);
  constructor(
    private readonly service: TrainingPlanService,
    private readonly exerciseImageService: ExerciseImageService,
    private readonly personalTrainingPlanService: PersonalTrainingPlanService,
  ) {}
  async execute(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<GlobalTrainingPlanWorkoutDetailsResponse> {
    this.logger.log('GetTrainingPlanWorkoutCommand -> execute -> params:', {
      params: { trainingPlanId, workoutId },
    });
    const workout = await this.service.getWorkout(trainingPlanId, workoutId);
    this.logger.log(
      'GetTrainingPlanWorkoutCommand -> execute -> trainingPlanService return:',
      {
        data: {
          exerciseCount: workout.exercises.length,
          version: workout.version,
        },
      },
    );
    const exercises = await this.exerciseImageService.hydrateExercises(
      workout.exercises,
    );
    this.logger.log(
      'GetTrainingPlanWorkoutCommand -> execute -> exerciseImageService return:',
      { data: { exerciseCount: exercises.length } },
    );
    const usage =
      await this.personalTrainingPlanService.usageForGlobal(trainingPlanId);
    const data = { ...workout, exercises, usage };
    const result = { data };
    this.logger.log('GetTrainingPlanWorkoutCommand -> execute -> return:', {
      data: { trainingPlanId, workoutId },
    });
    return result;
  }
}
