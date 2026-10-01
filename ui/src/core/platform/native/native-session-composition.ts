import { createNativeSession, revokeNativeSession } from '~/auth/auth-service';
import { NativeSessionCoordinator } from '~/auth/native-session';
import { NativeAppCompatibilityCoordinator } from '~/core/platform/native/app-compatibility';
import { GoogleSignInAdapter } from '~/core/platform/native/google-sign-in-adapter';
import { NativeLocalDataAdapter } from '~/core/platform/native/local-data-adapter';
import { NativeTrainingRepository } from '~/core/platform/native/native-training-repository';
import { OfflinePreparationCoordinator } from '~/core/platform/native/offline-preparation';
import { offlineStoragePlugin } from '~/core/platform/native/offline-storage-plugin';
import { OfflineSyncCoordinator } from '~/core/platform/native/offline-sync';
import { SecureCredentialAdapter } from '~/core/platform/native/secure-credential-adapter';
import type { TrainingRepository } from '~/routes/training/training-repository';
import {
  getTrainingOverview,
  getTrainingWorkoutPreview,
  registerOfflineTrainingLease,
  takeoverOfflineTrainingLease,
} from '~/routes/training/training-service';

export interface NativeComposition {
  appCompatibility: NativeAppCompatibilityCoordinator;
  offlinePreparation: OfflinePreparationCoordinator;
  offlineSync: OfflineSyncCoordinator;
  session: NativeSessionCoordinator;
  trainingRepository: TrainingRepository;
}

export async function createNativeComposition(): Promise<NativeComposition> {
  const clientId = import.meta.env.VITE_GOOGLE_SERVER_CLIENT_ID?.trim() ?? '';

  const coordinator = new NativeSessionCoordinator(
    new GoogleSignInAdapter(clientId),
    new SecureCredentialAdapter(),
    new NativeLocalDataAdapter(),
    {
      createSession: createNativeSession,
      revokeSession: revokeNativeSession,
    },
  );
  await coordinator.initialize();
  const appCompatibility = new NativeAppCompatibilityCoordinator();
  await appCompatibility.initialize();
  const offlinePreparation = new OfflinePreparationCoordinator({
    getInstallationId: () => coordinator.getInstallationId(),
    getOverview: (catalogEntryId) =>
      getTrainingOverview('active-plan', catalogEntryId),
    getPreview: (workoutId, catalogEntryId) =>
      getTrainingWorkoutPreview(workoutId, 'active-plan', catalogEntryId),
    plugin: offlineStoragePlugin,
    registerLease: registerOfflineTrainingLease,
    takeoverLease: takeoverOfflineTrainingLease,
  });
  const offlineSync = new OfflineSyncCoordinator(coordinator);
  await offlineSync.initialize();
  return {
    appCompatibility,
    offlinePreparation,
    offlineSync,
    session: coordinator,
    trainingRepository: new NativeTrainingRepository(offlineStoragePlugin),
  };
}
