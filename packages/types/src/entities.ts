export type EntityId = string;
export type Timestamp = string;

export interface Entity {
  id: EntityId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type Theme = 'dark' | 'light';

export interface PersonConfigs {
  theme?: Theme;
}

export interface Person extends Entity {
  configs: PersonConfigs;
  name: string;
  email: string;
  photoUrl: string | null;
  isAdmin?: true;
}

export interface TrainingPlanSummary extends Entity {
  name: string;
  description: string;
}

export interface TrainingPlanWorkoutSummary {
  id: EntityId;
  name: string;
  exerciseCount: number;
}

export interface TrainingPlanDetails extends TrainingPlanSummary {
  workouts: readonly TrainingPlanWorkoutSummary[];
}
