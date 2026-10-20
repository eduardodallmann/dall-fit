import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '~/index.css';

import App from '~/app';
import type { NativeSessionCoordinator } from '~/auth/native-session';
import { configureSessionChannel } from '~/auth/session-channel';
import { AppProviders } from '~/context/providers';
import { reportSystemFailure } from '~/core/analytics';
import {
  ApplicationErrorBoundary,
  ApplicationFallback,
} from '~/core/components/application-fallback';
import type { NativeAppCompatibilityCoordinator } from '~/core/platform/native/app-compatibility';
import type { OfflinePreparationCoordinator } from '~/core/platform/native/offline-preparation';
import type { OfflineSyncCoordinator } from '~/core/platform/native/offline-sync';
import { resolveApplicationPlatform } from '~/core/platform/platform-composition';
import { bootstrapTheme } from '~/core/theme/theme-storage';
import type { TrainingRepository } from '~/routes/training/training-repository';

export async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (rootElement === null) throw new Error('Root element was not found.');
  const root = createRoot(rootElement, {
    onRecoverableError: () => reportSystemFailure('render'),
    onUncaughtError: () => reportSystemFailure('render'),
  });

  try {
    const initialTheme = bootstrapTheme();
    const platform = resolveApplicationPlatform();
    let nativeSession: NativeSessionCoordinator | null = null;
    let appCompatibility: NativeAppCompatibilityCoordinator | null = null;
    let offlinePreparation: OfflinePreparationCoordinator | null = null;
    let offlineSync: OfflineSyncCoordinator | null = null;
    let trainingRepository: TrainingRepository | null = null;
    if (platform.capabilities.nativeAuthentication) {
      const { createNativeComposition } =
        await import('~/core/platform/native/native-session-composition');
      const composition = await createNativeComposition();
      nativeSession = composition.session;
      appCompatibility = composition.appCompatibility;
      offlinePreparation = composition.offlinePreparation;
      offlineSync = composition.offlineSync;
      trainingRepository = composition.trainingRepository;
      configureSessionChannel('native', {
        getAccessToken: () => composition.session.getAccessToken(),
        handleUnauthorized: () => composition.session.expireSession(),
      });
    } else {
      configureSessionChannel('web');
    }

    if (
      import.meta.env.DEV &&
      import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
    ) {
      const { mockWorker } = await import('~/mocks/browser');
      await mockWorker.start({ onUnhandledFrame: 'bypass' });
    }

    root.render(
      <StrictMode>
        <ApplicationErrorBoundary>
          <AppProviders
            appCompatibility={appCompatibility}
            initialTheme={initialTheme}
            nativeSession={nativeSession}
            offlinePreparation={offlinePreparation}
            offlineSync={offlineSync}
            platform={platform}
            trainingRepository={trainingRepository}
          >
            <App />
          </AppProviders>
        </ApplicationErrorBoundary>
      </StrictMode>,
    );
  } catch {
    reportSystemFailure('bootstrap');
    root.render(<ApplicationFallback />);
  }
}

bootstrap().catch(() => undefined);
