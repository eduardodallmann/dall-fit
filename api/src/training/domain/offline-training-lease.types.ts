export const OFFLINE_TRAINING_LEASE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OfflineTrainingLeaseState =
  'created' | 'plan-rebound' | 'taken-over' | 'unchanged';

export interface OfflineTrainingLease {
  expiresAt: string;
  installationId: string;
  leaseId: string;
  planId: string;
  personId: string;
}

export interface OfflineTrainingLeasePublic {
  expiresAt: string;
  leaseId: string;
  planId: string;
  state: OfflineTrainingLeaseState;
}

export interface OfflineTrainingLeaseResponse {
  data: OfflineTrainingLeasePublic;
}

export interface OfflineTrainingLeaseIdentity {
  installationId: string;
  leaseId: string;
  planId: string;
  personId: string;
}
