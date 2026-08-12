import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '~/index.css';

import App from '~/app';
import { AppProviders } from '~/context/providers';
import { reportSystemFailure } from '~/core/analytics';
import {
  ApplicationErrorBoundary,
  ApplicationFallback,
} from '~/core/components/application-fallback';
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
          <AppProviders initialTheme={initialTheme}>
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
