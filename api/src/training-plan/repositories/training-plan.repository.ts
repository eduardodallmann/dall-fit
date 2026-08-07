import type {
  DeleteWorkoutResult,
  NewTrainingPlan,
  TrainingPlanChanges,
  TrainingPlanEntity,
  TrainingPlanPage,
  TrainingPlanWorkoutSummary,
} from '~/training-plan/domain/training-plan.entity';

export abstract class TrainingPlanRepository {
  abstract listGlobal(
    page: number,
    pageSize: number,
  ): Promise<TrainingPlanPage>;

  abstract create(plan: NewTrainingPlan): Promise<TrainingPlanEntity>;

  abstract findGlobalById(id: string): Promise<TrainingPlanEntity | null>;

  abstract updateGlobal(
    id: string,
    changes: TrainingPlanChanges,
  ): Promise<TrainingPlanEntity | null>;

  abstract deleteGlobal(id: string): Promise<boolean>;

  abstract createWorkout(
    trainingPlanId: string,
    name: string,
  ): Promise<TrainingPlanWorkoutSummary | null>;

  abstract deleteWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<DeleteWorkoutResult>;
}
