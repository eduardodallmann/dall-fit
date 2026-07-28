import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '~/index.css';

import App from '~/app';
import { AppProviders } from '~/context/providers';

async function bootstrap() {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_MOCKS === 'true') {
    const { mockWorker } = await import('~/mocks/browser');
    await mockWorker.start({ onUnhandledRequest: 'bypass' });
  }

  const rootElement = document.getElementById('root');
  if (rootElement === null) {
    throw new Error('Root element was not found.');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}

void bootstrap();
