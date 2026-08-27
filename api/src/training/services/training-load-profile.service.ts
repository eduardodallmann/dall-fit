import { Injectable, Logger } from '@nestjs/common';

import type {
  TrainingLoadProfile,
  TrainingLoadProfileWrite,
} from '~/training/domain/training.types';
import { TrainingLoadProfileRepository } from '~/training/repositories/training-load-profile.repository';

@Injectable()
export class TrainingLoadProfileService {
  private readonly logger = new Logger(TrainingLoadProfileService.name);

  constructor(private readonly repository: TrainingLoadProfileRepository) {}

  async findForExercises(
    personId: string,
    trainingPlanId: string,
    exerciseIds: readonly string[],
  ): Promise<readonly TrainingLoadProfile[]> {
    this.logger.log(
      'TrainingLoadProfileService -> findForExercises -> params:',
      {
        params: { exerciseCount: exerciseIds.length, personId, trainingPlanId },
      },
    );
    const result = await this.repository.findForExercises(
      personId,
      trainingPlanId,
      exerciseIds,
    );
    this.logger.log(
      'TrainingLoadProfileService -> findForExercises -> return:',
      {
        data: { count: result.length },
      },
    );
    return result;
  }

  async save(input: TrainingLoadProfileWrite): Promise<void> {
    this.logger.log('TrainingLoadProfileService -> save -> params:', {
      params: {
        exerciseId: input.exerciseId,
        personId: input.personId,
        trainingPlanId: input.trainingPlanId,
      },
    });
    await this.repository.save(input);
    this.logger.log('TrainingLoadProfileService -> save -> completed:', {
      data: { exerciseId: input.exerciseId },
    });
  }

  async cleanupExercise(
    trainingPlanId: string,
    exerciseId: string,
  ): Promise<void> {
    this.logger.log(
      'TrainingLoadProfileService -> cleanupExercise -> params:',
      {
        params: { exerciseId, trainingPlanId },
      },
    );
    await this.repository.deleteForExercise(trainingPlanId, exerciseId);
    this.logger.log(
      'TrainingLoadProfileService -> cleanupExercise -> completed:',
      { data: { exerciseId, trainingPlanId } },
    );
  }

  async cleanupWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<void> {
    this.logger.log('TrainingLoadProfileService -> cleanupWorkout -> params:', {
      params: { trainingPlanId, workoutId },
    });
    await this.repository.deleteForWorkout(trainingPlanId, workoutId);
    this.logger.log(
      'TrainingLoadProfileService -> cleanupWorkout -> completed:',
      {
        data: { trainingPlanId, workoutId },
      },
    );
  }

  async cleanupPlan(trainingPlanId: string): Promise<void> {
    this.logger.log('TrainingLoadProfileService -> cleanupPlan -> params:', {
      params: { trainingPlanId },
    });
    await this.repository.deleteForPlan(trainingPlanId);
    this.logger.log('TrainingLoadProfileService -> cleanupPlan -> completed:', {
      data: { trainingPlanId },
    });
  }
}
