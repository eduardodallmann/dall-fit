import type {
  ExerciseChanges,
  ImageWriteInput,
  NewTrainingPlan,
  StoredExercise,
  StoredExerciseImage,
  TargetState,
  TrainingPlanChanges,
  TrainingPlanEntity,
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
  abstract findGlobalById(id: string): Promise<TrainingPlanEntity | null>;
  abstract updateGlobal(
    id: string,
    expectedVersion: number,
    changes: TrainingPlanChanges,
  ): Promise<VersionedResult<TrainingPlanEntity> | null>;
  abstract deleteGlobal(
    id: string,
    expectedVersion: number,
  ): Promise<readonly StoredExerciseImage[] | null>;
  abstract createWorkout(
    trainingPlanId: string,
    expectedVersion: number,
    name: string,
  ): Promise<VersionedResult<TrainingPlanWorkoutSummary> | null>;
  abstract deleteWorkout(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
  ): Promise<VersionedResult<readonly StoredExerciseImage[]> | null>;
  abstract findWorkout(
    trainingPlanId: string,
    workoutId: string,
  ): Promise<WorkoutAggregate | null>;
  abstract updateWorkoutName(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    name: string,
  ): Promise<VersionedResult<WorkoutNameResult> | null>;
  abstract createExercise(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exercise: StoredExercise,
  ): Promise<VersionedResult<StoredExercise> | null>;
  abstract updateExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    changes: ExerciseChanges,
  ): Promise<VersionedResult<StoredExercise> | null>;
  abstract deleteExercise(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
  ): Promise<VersionedResult<StoredExerciseImage | null> | null>;
  abstract reorderExercises(
    trainingPlanId: string,
    workoutId: string,
    expectedVersion: number,
    exerciseIds: readonly string[],
  ): Promise<VersionedResult<undefined> | null>;
  abstract updateExerciseImage(
    trainingPlanId: string,
    workoutId: string,
    exerciseId: string,
    expectedVersion: number,
    input: ImageWriteInput,
  ): Promise<VersionedResult<StoredExerciseImage | null> | null>;
  abstract inspectTarget(
    trainingPlanId: string,
    workoutId?: string,
    exerciseId?: string,
  ): Promise<TargetState>;
  abstract listReferencedImageKeys(): Promise<ReadonlySet<string>>;
}
