import type {
  GlobalTrainingPlanLibraryItem,
  GlobalTrainingPlanUsage,
  PersonalTrainingPlanListItem,
} from '@dall-fit/types';

import type {
  StoredExercise,
  StoredImageVariant,
  TrainingPlanExecutionTree,
} from '~/training-plan/domain/training-plan.entity';
import type {
  CloneJobState,
  PersonalCatalogKind,
} from '~/training-plan/repositories/personal-training-plan.schema';

export interface PersonalCatalogEntry {
  createdAt: string;
  globalTrainingPlanId: string | null;
  id: string;
  kind: PersonalCatalogKind;
  personId: string;
  trainingPlanId: string | null;
  updatedAt: string;
}

export interface PersonalTrainingExecutionPlan {
  catalogEntryId: string;
  ownerPersonId: string | null;
  plan: TrainingPlanExecutionTree;
  source: 'global-reference' | 'owned';
}

export interface PersonalTrainingPlanPage {
  activeCount: number;
  data: readonly PersonalTrainingPlanListItem[];
  total: number;
}

export interface GlobalTrainingPlanLibraryPage {
  data: readonly GlobalTrainingPlanLibraryItem[];
  total: number;
}

export interface CloneSnapshotImageVariant extends StoredImageVariant {
  etag: string;
}

export interface CloneSnapshotImage {
  display: CloneSnapshotImageVariant;
  thumbnail: CloneSnapshotImageVariant;
}

export type CloneSnapshotExercise =
  | Exclude<StoredExercise, { type: 'image' }>
  | (Omit<Extract<StoredExercise, { type: 'image' }>, 'image'> & {
      image: CloneSnapshotImage | null;
    });

export interface CloneSnapshotWorkoutDraft {
  exercises: readonly StoredExercise[];
  id: string;
  name: string;
}

export interface TrainingPlanCloneSnapshotDraft {
  description: string;
  name: string;
  sourceTrainingPlanId: string;
  sourceVersion: number;
  workouts: readonly CloneSnapshotWorkoutDraft[];
}

export interface TrainingPlanCloneSnapshot extends Omit<
  TrainingPlanCloneSnapshotDraft,
  'workouts'
> {
  workouts: readonly (Omit<CloneSnapshotWorkoutDraft, 'exercises'> & {
    exercises: readonly CloneSnapshotExercise[];
  })[];
}

export interface NewTrainingPlanCloneJob {
  globalTrainingPlanId: string;
  personId: string;
  snapshot: TrainingPlanCloneSnapshot;
  sourceName: string;
  totalImages: number;
}

export interface TrainingPlanCloneJob {
  cancelRequestedAt: string | null;
  cloneJobId: string;
  completedImages: number;
  createdAt: string;
  failureCategory: string | null;
  generation: number;
  globalTrainingPlanId: string;
  personId: string;
  snapshot: TrainingPlanCloneSnapshot;
  sourceName: string;
  state: CloneJobState;
  totalImages: number | null;
  updatedAt: string;
  workflowRunId: string | null;
}

export interface CloneJobStateUpdate {
  failureCategory?: string | null;
  state: CloneJobState;
}

export type GlobalTrainingPlanUsageMap = ReadonlyMap<
  string,
  GlobalTrainingPlanUsage
>;
