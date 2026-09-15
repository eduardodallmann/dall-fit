import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

import type {
  OfflineTrainingSnapshotConflictDetails,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

export type OfflineStorageRecovery = 'migration-reset' | 'none';

export interface OfflineStorageState {
  accountBound: boolean;
  initialized: true;
  pendingSnapshotCount: number;
  preparedPlanAvailable: boolean;
  readyFileCount: number;
  recovery: OfflineStorageRecovery;
  resetGeneration: number;
  revision: number;
  sessionAvailable: boolean;
  temporaryFileCount: number;
}

export interface OfflineStoredAggregate {
  expiresAt?: string;
  id: string;
  payload: Readonly<Record<string, unknown>>;
  payloadVersion: number;
  planId: string;
  revision: number;
  updatedAt: string;
  validatedAt?: string;
}

export interface OfflineFileMetadata {
  contentType: string;
  fileId: string;
  planId?: string;
  revision: number;
  sizeBytes: number;
  status: 'ready' | 'temporary';
  updatedAt: string;
}

export interface OfflineSyncState {
  actionRequired: boolean;
  pendingCount: number;
  revision: number;
  state:
    | 'action-required'
    | 'authentication-required'
    | 'idle'
    | 'pending'
    | 'syncing';
}

export interface OfflineCompletionPresentation {
  executionId: string;
  presentation:
    | WorkoutExecutionSummary
    | {
        completedAt: string;
        completedExerciseCount: number;
        fullCompletion: boolean;
        totalExerciseCount: number;
        workoutName: string;
      };
  status: 'canonical' | 'pending';
  updatedAt: string;
}

export interface OfflineSyncAction {
  details?: OfflineTrainingSnapshotConflictDetails;
  executionId: string;
  local: Readonly<Record<string, unknown>>;
  reason: 'conflict' | 'discard-local-only' | 'lease-expired' | 'lease-revoked';
  revision: number;
}

export interface OfflineStoragePlugin {
  addListener(
    eventName: 'stateChanged',
    listener: (state: OfflineStorageState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'syncStateChanged',
    listener: (state: OfflineSyncState) => void,
  ): Promise<PluginListenerHandle>;
  bindAccount(options: { personId: string }): Promise<void>;
  clearAccountData(): Promise<void>;
  clearInvalidLeaseData(): Promise<void>;
  clearSyncCredentials(): Promise<OfflineSyncState>;
  commitTrainingSession(options: {
    executionId: string;
    planId: string;
    revision: number;
    sessionId: string;
    sessionPayload: Readonly<Record<string, unknown>>;
    snapshotPayload: Readonly<Record<string, unknown>>;
    completionPresentation?: Readonly<Record<string, unknown>>;
    updatedAt: string;
  }): Promise<void>;
  commitTrainingTerminal(options: {
    executionId: string;
    expectedSessionRevision: number;
    planId: string;
    revision: number;
    sessionId: string;
    snapshotPayload: Readonly<Record<string, unknown>>;
    updatedAt: string;
  }): Promise<void>;
  downloadFile(options: {
    contentType: 'image/webp';
    expectedPlanRevision: number;
    fileId: string;
    planId: string;
    revision: number;
    url: string;
  }): Promise<{ file: OfflineFileMetadata }>;
  completeFile(options: {
    expectedRevision: number;
    fileId: string;
    updatedAt: string;
  }): Promise<{ file: OfflineFileMetadata }>;
  getActiveSession(): Promise<{ aggregate?: OfflineStoredAggregate }>;
  getFile(options: { fileId: string }): Promise<{ file?: OfflineFileMetadata }>;
  getReadyFileUrl(options: { fileId: string }): Promise<{ url?: string }>;
  getMonotonicTime(): Promise<{ elapsedRealtime: number }>;
  getActionNotificationPermission(): Promise<{
    granted: boolean;
    prompted: boolean;
  }>;
  getLatestCompletion(): Promise<{
    completion?: OfflineCompletionPresentation;
  }>;
  getNextSyncAction(): Promise<{ action?: OfflineSyncAction }>;
  getPreparedPlan(): Promise<{ aggregate?: OfflineStoredAggregate }>;
  getSnapshot(options: {
    executionId: string;
  }): Promise<{ aggregate?: OfflineStoredAggregate }>;
  getState(): Promise<OfflineStorageState>;
  getSyncState(): Promise<OfflineSyncState>;
  hasPendingChanges(): Promise<{ value: boolean }>;
  initialize(): Promise<OfflineStorageState>;
  listSnapshots(): Promise<{ aggregates: OfflineStoredAggregate[] }>;
  putActiveSession(options: {
    payload: Readonly<Record<string, unknown>>;
    payloadVersion: number;
    planId: string;
    revision: number;
    sessionId: string;
    updatedAt: string;
  }): Promise<void>;
  putPreparedPlan(options: {
    expectedPlanId?: string;
    expectedRevision?: number;
    expiresAt: string;
    payload: Readonly<Record<string, unknown>>;
    payloadVersion: number;
    planId: string;
    revision: number;
    validatedAt: string;
  }): Promise<void>;
  putSnapshot(options: {
    executionId: string;
    payload: Readonly<Record<string, unknown>>;
    payloadVersion: number;
    planId: string;
    revision: number;
    updatedAt: string;
  }): Promise<void>;
  registerTemporaryFile(options: {
    contentType: string;
    expectedRevision?: number;
    fileId: string;
    planId?: string;
    revision: number;
    updatedAt: string;
  }): Promise<{ file: OfflineFileMetadata }>;
  dismissActionNotificationPrompt(): Promise<void>;
  requestActionNotificationPermission(): Promise<{ granted: boolean }>;
  removeActiveSession(options: {
    expectedRevision: number;
    sessionId: string;
  }): Promise<{ removed: boolean }>;
  removeFile(options: {
    expectedRevision: number;
    fileId: string;
  }): Promise<{ removed: boolean }>;
  removePreparedPlan(options: {
    expectedRevision: number;
    planId: string;
  }): Promise<{ removed: boolean }>;
  removeSnapshot(options: {
    executionId: string;
    expectedRevision: number;
  }): Promise<{ removed: boolean }>;
  resolveSyncConflict(options: {
    choice: 'local' | 'server';
    conflictToken: string;
    executionId: string;
    expectedRevision: number;
  }): Promise<{ resolved: boolean }>;
  discardSyncAction(options: {
    executionId: string;
    expectedRevision: number;
  }): Promise<{ discarded: boolean }>;
  triggerSync(options: {
    accessToken: string;
    apiBaseUrl: string;
    rearmTemporary: boolean;
  }): Promise<OfflineSyncState>;
}

export const offlineStoragePlugin =
  registerPlugin<OfflineStoragePlugin>('OfflineStorage');
