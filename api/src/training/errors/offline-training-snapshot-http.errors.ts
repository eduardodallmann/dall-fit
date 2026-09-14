import { HttpException, HttpStatus } from '@nestjs/common';

import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
} from '~/training/errors/offline-training-lease.errors';
import {
  OfflineTrainingExecutionConflictError,
  OfflineTrainingSnapshotIdempotencyConflictError,
  OfflineTrainingSnapshotStaleError,
  OfflineTrainingSnapshotSyncInProgressError,
  OfflineTrainingSnapshotUnavailableError,
} from '~/training/errors/offline-training-snapshot.errors';

function snapshotHttpError(
  status: HttpStatus,
  code: string,
  message: string,
): HttpException {
  const result = new HttpException({ code, details: {}, message }, status);
  return result;
}

export function mapOfflineTrainingSnapshotHttpError(error: unknown): never {
  if (error instanceof OfflineTrainingSnapshotSyncInProgressError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_SYNC_IN_PROGRESS',
      'Offline training synchronization is already in progress.',
    );
  }
  if (error instanceof OfflineTrainingSnapshotStaleError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_SNAPSHOT_STALE',
      'The offline training snapshot revision is stale.',
    );
  }
  if (error instanceof OfflineTrainingSnapshotIdempotencyConflictError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_SNAPSHOT_IDEMPOTENCY_CONFLICT',
      'The offline training snapshot conflicts with an accepted revision.',
    );
  }
  if (error instanceof OfflineTrainingExecutionConflictError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_EXECUTION_CONFLICT',
      'Another offline training execution is current.',
    );
  }
  if (error instanceof OfflineTrainingLeaseExpiredError) {
    throw snapshotHttpError(
      HttpStatus.GONE,
      'OFFLINE_LEASE_EXPIRED',
      'The offline training lease expired.',
    );
  }
  if (error instanceof OfflineTrainingLeaseRevokedError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_LEASE_REVOKED',
      'The offline training lease was revoked.',
    );
  }
  if (error instanceof OfflineTrainingSnapshotUnavailableError) {
    throw snapshotHttpError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE',
      'Offline training snapshot synchronization is temporarily unavailable.',
    );
  }
  throw error;
}
