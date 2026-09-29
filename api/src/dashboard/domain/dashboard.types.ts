import type { BodyArea } from '@dall-fit/types';

export interface DashboardExecutionDay {
  completedWorkoutCount: number;
  date: string;
}

export interface DashboardExecutionTotals {
  completedWorkoutCount: number;
  fullCompletionCount: number;
  totalDurationSeconds: number;
}

export interface DashboardRecentExecution {
  bodyAreas: readonly BodyArea[];
  completedAt: Date;
  completedExerciseCount: number;
  durationSeconds: number;
  fullCompletion: boolean;
  id: string;
  planName: string;
  totalExerciseCount: number;
  workoutName: string;
}

export interface PersonalDashboardReadModel {
  days: readonly DashboardExecutionDay[];
  last30Days: DashboardExecutionTotals;
  recentWorkouts: readonly DashboardRecentExecution[];
}

export interface AdminDashboardExecutionDay extends DashboardExecutionDay {
  personIds: readonly string[];
}

export interface AdminDashboardReadModel {
  days: readonly AdminDashboardExecutionDay[];
  last30Days: DashboardExecutionTotals & { personIds: readonly string[] };
  people: {
    activePlanCount: number;
    newLast30DaysCount: number;
    totalCount: number;
  };
  plans: {
    activeSelectionCount: number;
    globalReferenceCount: number;
    globalTemplateCount: number;
    ownedCount: number;
  };
  topGlobalPlans: readonly {
    activePeopleCount: number;
    id: string;
    linkedPeopleCount: number;
    name: string;
  }[];
}
