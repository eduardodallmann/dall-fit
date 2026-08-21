export type CloneJobState =
  | 'start-failed'
  | 'queued'
  | 'running'
  | 'materializing'
  | 'cancelling'
  | 'failed'
  | 'completed'
  | 'cancelled';

export interface SnapshotImageVariant {
  etag: string;
  key: string;
  width: number;
  height: number;
}

export interface SnapshotImage {
  display: SnapshotImageVariant;
  thumbnail: SnapshotImageVariant;
}

export interface SnapshotExercise {
  id: string;
  image?: SnapshotImage | null;
  type: 'youtube-short' | 'image' | 'youtube-long' | 'pause' | 'duration';
  [field: string]: unknown;
}

export interface SnapshotWorkout {
  exercises: SnapshotExercise[];
  id: string;
  name: string;
}

export interface TrainingPlanCloneSnapshot {
  description: string;
  name: string;
  sourceTrainingPlanId: string;
  sourceVersion: number;
  workouts: SnapshotWorkout[];
}

export interface CopiedCloneImage {
  display: Omit<SnapshotImageVariant, 'etag'>;
  exerciseId: string;
  thumbnail: Omit<SnapshotImageVariant, 'etag'>;
}

export interface TrainingPlanCloneJob {
  _id: string;
  cancelRequestedAt: Date | null;
  completedImages: number;
  copiedImages: CopiedCloneImage[];
  generation: number;
  personId: string;
  snapshot: TrainingPlanCloneSnapshot;
  state: CloneJobState;
  workflowRunId: string | null;
}

export type CloneWorkDecision =
  | { kind: 'obsolete' }
  | { kind: 'cleanup' }
  | { kind: 'finalize' }
  | { kind: 'copy'; exerciseIds: string[] };

export interface StartCloneRunInput {
  cloneJobId: string;
  generation: number;
}

export type StartReservation = 'accepted' | 'start';
