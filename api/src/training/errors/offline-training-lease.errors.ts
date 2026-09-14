export class OfflineTrainingLeaseTakeoverRequiredError extends Error {
  constructor() {
    super('Offline training lease takeover is required.');
    this.name = OfflineTrainingLeaseTakeoverRequiredError.name;
  }
}

export class OfflineTrainingLeaseExpiredError extends Error {
  constructor() {
    super('Offline training lease expired.');
    this.name = OfflineTrainingLeaseExpiredError.name;
  }
}

export class OfflineTrainingLeaseRevokedError extends Error {
  constructor() {
    super('Offline training lease was revoked.');
    this.name = OfflineTrainingLeaseRevokedError.name;
  }
}

export class OfflineTrainingLeaseUnavailableError extends Error {
  constructor() {
    super('Offline training lease is unavailable.');
    this.name = OfflineTrainingLeaseUnavailableError.name;
  }
}
