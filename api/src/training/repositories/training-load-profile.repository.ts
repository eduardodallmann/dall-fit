import type {
  TrainingLoadProfile,
  TrainingLoadProfileWrite,
} from '~/training/domain/training.types';

export abstract class TrainingLoadProfileRepository {
  abstract findForExercises(
    personId: string,
    trainingPlanId: string,
    exerciseIds: readonly string[],
  ): Promise<readonly TrainingLoadProfile[]>;
  abstract save(input: TrainingLoadProfileWrite): Promise<void>;
  abstract deleteForExercise(
    trainingPlanId: string,
    exerciseId: string,
  ): Promise<void>;
  abstract deleteForWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<void>;
  abstract deleteForPlan(trainingPlanId: string): Promise<void>;
}
