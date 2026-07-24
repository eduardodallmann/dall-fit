import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '~/index.css';

import App from '~/app';
import { AppProviders } from '~/context/providers';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
