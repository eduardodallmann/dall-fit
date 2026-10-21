import type { ExerciseLibraryCandidate } from '~/training-plan/domain/exercise-library';
import type { StoredExercise } from '~/training-plan/domain/training-plan.entity';

export abstract class ExerciseLibraryRepository {
  abstract representatives(): Promise<readonly ExerciseLibraryCandidate[]>;
  abstract append(
    personId: string,
    trainingPlanId: string,
    workoutId: string,
    version: number,
    exercises: readonly StoredExercise[],
  ): Promise<boolean>;
}
