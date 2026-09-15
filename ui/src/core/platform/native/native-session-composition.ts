import { createNativeSession, revokeNativeSession } from '~/auth/auth-service';
import { NativeSessionCoordinator } from '~/auth/native-session';
import { GoogleSignInAdapter } from '~/core/platform/native/google-sign-in-adapter';
import { NativeLocalDataAdapter } from '~/core/platform/native/local-data-adapter';
import { OfflinePreparationCoordinator } from '~/core/platform/native/offline-preparation';
import { offlineStoragePlugin } from '~/core/platform/native/offline-storage-plugin';
import { OfflineSyncCoordinator } from '~/core/platform/native/offline-sync';
import { SecureCredentialAdapter } from '~/core/platform/native/secure-credential-adapter';
import {
  getTrainingOverview,
  getTrainingWorkoutPreview,
} from '~/routes/training/training-service';

export interface NativeComposition {
  offlinePreparation: OfflinePreparationCoordinator;
  offlineSync: OfflineSyncCoordinator;
  session: NativeSessionCoordinator;
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
  const offlinePreparation = new OfflinePreparationCoordinator({
    getOverview: () => getTrainingOverview('active-plan'),
    getPreview: (workoutId) =>
      getTrainingWorkoutPreview(workoutId, 'active-plan'),
    plugin: offlineStoragePlugin,
  });
  const offlineSync = new OfflineSyncCoordinator(coordinator);
  await offlineSync.initialize();
  return { offlinePreparation, offlineSync, session: coordinator };
}
