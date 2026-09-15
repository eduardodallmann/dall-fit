import type {
  OfflineTrainingLeaseResponse,
  OfflineTrainingLeaseState,
} from '@dall-fit/types';

export const OFFLINE_TRAINING_LEASE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type { OfflineTrainingLeaseResponse, OfflineTrainingLeaseState };

export interface OfflineTrainingLease {
  expiresAt: string;
  installationId: string;
  leaseId: string;
  planId: string;
  personId: string;
}

export type OfflineTrainingLeasePublic = OfflineTrainingLeaseResponse['data'];

export interface OfflineTrainingLeaseIdentity {
  installationId: string;
  leaseId: string;
  planId: string;
  personId: string;
}
