import type {
  OfflineTrainingSnapshotResult,
  PutOfflineTrainingSnapshotV1Request,
} from '@dall-fit/types';

export const OFFLINE_TRAINING_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_TRAINING_SNAPSHOT_LOCK_TTL_MS = 15_000;

export interface OfflineTrainingSnapshotIngestInput {
  contentHash: string;
  personId: string;
  request: PutOfflineTrainingSnapshotV1Request;
  serializedSnapshot: string;
}

export interface OfflineTrainingSnapshotIngestResult {
  contentHash: string;
  effectiveRequest: PutOfflineTrainingSnapshotV1Request;
  result: OfflineTrainingSnapshotResult;
}

export interface OfflineTrainingTerminalCleanupInput {
  contentHash: string;
  executionId: string;
  personId: string;
  revision: number;
}
