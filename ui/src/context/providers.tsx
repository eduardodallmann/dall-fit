import type { PropsWithChildren } from 'react';

import { Toast } from '@heroui/react';
import { QueryClientProvider } from '@tanstack/react-query';

import type { NativeSessionCoordinator } from '~/auth/native-session';
import { NativeSessionContext } from '~/auth/native-session-context';
import { queryClient } from '~/context/query-client';
import { NativeAppCompatibilityGuard } from '~/core/components/native-app-compatibility-guard';
import { PwaUpdateNotice } from '~/core/components/pwa-update-notice';
import { WebConnectivityGuard } from '~/core/components/web-connectivity-guard';
import type { NativeAppCompatibilityCoordinator } from '~/core/platform/native/app-compatibility';
import { NativeAppCompatibilityContext } from '~/core/platform/native/app-compatibility-context';
import type { OfflinePreparationCoordinator } from '~/core/platform/native/offline-preparation';
import { OfflinePreparationContext } from '~/core/platform/native/offline-preparation-context';
import type { OfflineSyncCoordinator } from '~/core/platform/native/offline-sync';
import { OfflineSyncContext } from '~/core/platform/native/offline-sync-context';
import {
  PlatformContext,
  type PlatformSnapshot,
} from '~/core/platform/platform';
import { resolveApplicationPlatform } from '~/core/platform/platform-composition';
import { PwaProvider } from '~/core/pwa/pwa-provider';
import { ReloadSafetyProvider } from '~/core/reload-safety/reload-safety-provider';
import { ThemeProvider } from '~/core/theme/theme-provider';
import {
  getPublicThemeState,
  type ThemeState,
} from '~/core/theme/theme-storage';
import {
  TrainingRepositoryContext,
  type TrainingRepository,
} from '~/routes/training/training-repository';

interface AppProvidersProps extends PropsWithChildren {
  initialTheme?: ThemeState;
  appCompatibility?: NativeAppCompatibilityCoordinator | null;
  nativeSession?: NativeSessionCoordinator | null;
  offlinePreparation?: OfflinePreparationCoordinator | null;
  offlineSync?: OfflineSyncCoordinator | null;
  platform?: PlatformSnapshot;
  trainingRepository?: TrainingRepository | null;
}

export function AppProviders({
  appCompatibility = null,
  children,
  initialTheme = getPublicThemeState(),
  nativeSession = null,
  offlinePreparation = null,
  offlineSync = null,
  platform = resolveApplicationPlatform(),
  trainingRepository = null,
}: Readonly<AppProvidersProps>) {
  return (
    <PlatformContext value={platform}>
      <NativeAppCompatibilityContext value={appCompatibility}>
        <NativeSessionContext value={nativeSession}>
          <OfflinePreparationContext value={offlinePreparation}>
            <OfflineSyncContext value={offlineSync}>
              <TrainingRepositoryContext value={trainingRepository}>
                <QueryClientProvider client={queryClient}>
                  <ThemeProvider initialTheme={initialTheme}>
                    <ReloadSafetyProvider>
                      <PwaProvider>
                        <WebConnectivityGuard>
                          <NativeAppCompatibilityGuard>
                            {children}
                            <PwaUpdateNotice />
                            <Toast.Provider placement="bottom end" />
                          </NativeAppCompatibilityGuard>
                        </WebConnectivityGuard>
                      </PwaProvider>
                    </ReloadSafetyProvider>
                  </ThemeProvider>
                </QueryClientProvider>
              </TrainingRepositoryContext>
            </OfflineSyncContext>
          </OfflinePreparationContext>
        </NativeSessionContext>
      </NativeAppCompatibilityContext>
    </PlatformContext>
  );
}
