import type {
  ExerciseChanges,
  ImageWriteInput,
  NewTrainingPlan,
  StoredExercise,
  StoredExerciseImage,
  TargetState,
  TrainingPlanAccessScope,
  TrainingPlanChanges,
  TrainingPlanEntity,
  TrainingPlanExecutionTree,
  TrainingPlanPage,
  TrainingPlanWorkoutSummary,
  VersionedResult,
  WorkoutAggregate,
  WorkoutNameResult,
} from '~/training-plan/domain/training-plan.entity';

export abstract class TrainingPlanRepository {
  abstract listGlobal(
    page: number,
    pageSize: number,
  ): Promise<TrainingPlanPage>;
  abstract create(plan: NewTrainingPlan): Promise<TrainingPlanEntity>;
  abstract findById(
    id: string,
    scope: TrainingPlanAccessScope,
  ): Promise<TrainingPlanEntity | null>;
  abstract findExecutionTree(
    id: string,
    scope: TrainingPlanAccessScope,
  ): Promise<TrainingPlanExecutionTree | null>;
  abstract update(
    id: string,
    expectedVersion: number,
    changes: TrainingPlanChanges,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<TrainingPlanEntity> | null>;
  abstract delete(
    id: string,
    expectedVersion: number,
    scope: TrainingPlanAccessScope,
  ): Promise<readonly StoredExerciseImage[] | null>;
  abstract createWorkout(
    trainingPlanId: string,
    expectedVersion: number,
    name: string,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<TrainingPlanWorkoutSummary> | null>;
  abstract deleteWorkout(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<readonly StoredExerciseImage[]> | null>;
  abstract findWorkout(
    trainingPlanId: string,
    workoutId: string,
    scope: TrainingPlanAccessScope,
  ): Promise<WorkoutAggregate | null>;
  abstract updateWorkoutName(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    name: string,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<WorkoutNameResult> | null>;
  abstract createExercise(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exercise: StoredExercise,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<StoredExercise> | null>;
  abstract updateExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    changes: ExerciseChanges,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<StoredExercise> | null>;
  abstract deleteExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<StoredExerciseImage | null> | null>;
  abstract reorderExercises(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exerciseIds: readonly string[],
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<undefined> | null>;
  abstract updateExerciseImage(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    input: ImageWriteInput,
    scope: TrainingPlanAccessScope,
  ): Promise<VersionedResult<StoredExerciseImage | null> | null>;
  abstract inspectTarget(
    trainingPlanId: string,
    workoutId?: string,
    exerciseId?: string,
    scope?: TrainingPlanAccessScope,
  ): Promise<TargetState>;
  abstract listReferencedImageKeys(): Promise<ReadonlySet<string>>;
}
