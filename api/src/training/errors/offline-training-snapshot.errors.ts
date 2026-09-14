import type {
  OfflineTrainingServerVersionV1,
  OfflineTrainingSnapshotConflictDetails,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

export class OfflineTrainingSnapshotSyncInProgressError extends Error {
  constructor() {
    super('Offline training snapshot synchronization is in progress.');
    this.name = OfflineTrainingSnapshotSyncInProgressError.name;
  }
}

export class OfflineTrainingSnapshotUnavailableError extends Error {
  constructor() {
    super('Offline training snapshot is unavailable.');
    this.name = OfflineTrainingSnapshotUnavailableError.name;
  }
}

export class OfflineTrainingSnapshotResolutionExpiredError extends Error {
  constructor() {
    super('The offline training conflict token is no longer current.');
    this.name = OfflineTrainingSnapshotResolutionExpiredError.name;
  }
}

export class OfflineTrainingSnapshotVersionConflictError extends Error {
  readonly details: OfflineTrainingSnapshotConflictDetails;

  constructor(
    serverVersion: OfflineTrainingServerVersionV1,
    conflictToken: string,
  ) {
    super('Offline training snapshot versions conflict.');
    this.name = OfflineTrainingSnapshotVersionConflictError.name;
    this.details = {
      allowedResolution: 'local-or-server',
      conflictToken,
      serverVersion,
    };
  }
}

export class OfflineTrainingExecutionImmutableError extends Error {
  readonly details: OfflineTrainingSnapshotConflictDetails;

  constructor(
    terminalState: 'cancelled' | 'completed',
    completion?: WorkoutExecutionSummary,
  ) {
    super('The offline training execution is immutable.');
    this.name = OfflineTrainingExecutionImmutableError.name;
    this.details = {
      allowedResolution: 'discard-local-only',
      terminalState,
      ...(completion === undefined ? {} : { completion }),
    };
  }
}
