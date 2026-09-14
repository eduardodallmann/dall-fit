import { HttpException, HttpStatus } from '@nestjs/common';

import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
} from '~/training/errors/offline-training-lease.errors';
import {
  OfflineTrainingExecutionImmutableError,
  OfflineTrainingSnapshotResolutionExpiredError,
  OfflineTrainingSnapshotSyncInProgressError,
  OfflineTrainingSnapshotUnavailableError,
  OfflineTrainingSnapshotVersionConflictError,
} from '~/training/errors/offline-training-snapshot.errors';

function snapshotHttpError(
  status: HttpStatus,
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): HttpException {
  const result = new HttpException({ code, details, message }, status);
  return result;
}

export function mapOfflineTrainingSnapshotHttpError(error: unknown): never {
  if (error instanceof OfflineTrainingSnapshotResolutionExpiredError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_CONFLICT_TOKEN_STALE',
      'The offline training conflict changed before resolution.',
    );
  }
  if (error instanceof OfflineTrainingSnapshotVersionConflictError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT',
      'The offline training snapshot conflicts with the server version.',
      error.details,
    );
  }
  if (error instanceof OfflineTrainingExecutionImmutableError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_EXECUTION_IMMUTABLE',
      'The offline training execution is already terminal.',
      error.details,
    );
  }
  if (error instanceof OfflineTrainingSnapshotSyncInProgressError) {
    throw snapshotHttpError(
      HttpStatus.CONFLICT,
      'OFFLINE_TRAINING_SYNC_IN_PROGRESS',
      'Offline training synchronization is already in progress.',
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
