import type {
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutSummary,
} from '@dall-fit/types';

export interface TrainingPlanEntity extends TrainingPlanDetails {
  ownerPersonId: string | null;
}

export interface NewTrainingPlan {
  ownerPersonId: string | null;
  name: string;
  description: string;
}

export interface TrainingPlanChanges {
  name?: string;
  description?: string;
}

export interface TrainingPlanPage {
  data: readonly TrainingPlanSummary[];
  total: number;
}

export type DeleteWorkoutResult =
  'deleted' | 'training-plan-not-found' | 'workout-not-found';

export type { TrainingPlanWorkoutSummary };
