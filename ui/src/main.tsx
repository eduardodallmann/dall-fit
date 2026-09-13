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
import { resolveApplicationPlatform } from '~/core/platform/platform-composition';
import { bootstrapTheme } from '~/core/theme/theme-storage';

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
    if (platform.capabilities.nativeAuthentication) {
      const { createNativeSessionCoordinator } =
        await import('~/core/platform/native/native-session-composition');
      const coordinator = await createNativeSessionCoordinator();
      nativeSession = coordinator;
      configureSessionChannel('native', {
        getAccessToken: () => coordinator.getAccessToken(),
        handleUnauthorized: () => coordinator.expireSession(),
      });
    } else {
      configureSessionChannel('web');
    }

    if (
      import.meta.env.DEV &&
      import.meta.env.VITE_ENABLE_API_MOCKS === 'true'
    ) {
      const { mockWorker } = await import('~/mocks/browser');
      await mockWorker.start({ onUnhandledRequest: 'bypass' });
    }

    root.render(
      <StrictMode>
        <ApplicationErrorBoundary>
          <AppProviders
            initialTheme={initialTheme}
            nativeSession={nativeSession}
            platform={platform}
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
