export class OfflineTrainingSnapshotSyncInProgressError extends Error {
  constructor() {
    super('Offline training snapshot synchronization is in progress.');
    this.name = OfflineTrainingSnapshotSyncInProgressError.name;
  }
}

export class OfflineTrainingSnapshotStaleError extends Error {
  constructor() {
    super('Offline training snapshot revision is stale.');
    this.name = OfflineTrainingSnapshotStaleError.name;
  }
}

export class OfflineTrainingSnapshotIdempotencyConflictError extends Error {
  constructor() {
    super('Offline training snapshot idempotency conflict.');
    this.name = OfflineTrainingSnapshotIdempotencyConflictError.name;
  }
}

export class OfflineTrainingExecutionConflictError extends Error {
  constructor() {
    super('Another offline training execution is current.');
    this.name = OfflineTrainingExecutionConflictError.name;
  }
}

export class OfflineTrainingSnapshotUnavailableError extends Error {
  constructor() {
    super('Offline training snapshot is unavailable.');
    this.name = OfflineTrainingSnapshotUnavailableError.name;
  }
}
