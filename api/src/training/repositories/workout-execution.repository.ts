import type {
  NewWorkoutExecution,
  StoredWorkoutExecution,
  WorkoutExecutionWeekData,
} from '~/training/domain/training.types';

export abstract class WorkoutExecutionRepository {
  abstract begin(input: NewWorkoutExecution): Promise<StoredWorkoutExecution>;
  abstract complete(
    personId: string,
    sessionId: string,
  ): Promise<StoredWorkoutExecution>;
  abstract findById(
    personId: string,
    executionId: string,
  ): Promise<StoredWorkoutExecution | null>;
  abstract findBySession(
    personId: string,
    sessionId: string,
  ): Promise<StoredWorkoutExecution | null>;
  abstract findLastForPlan(
    personId: string,
    trainingPlanId: string,
  ): Promise<StoredWorkoutExecution | null>;
  abstract listCompletedBetween(
    personId: string,
    start: Date,
    end: Date,
  ): Promise<readonly WorkoutExecutionWeekData[]>;
}
