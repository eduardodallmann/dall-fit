export type EntityId = string;
export type Timestamp = string;

export interface Entity {
  id: EntityId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Person extends Entity {
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
