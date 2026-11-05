import { setupWorker } from 'msw/browser';

import { handlers } from '~/mocks/handlers';

const initialTermsScenario = new URLSearchParams(window.location.search).get(
  'mockTerms',
);
if (initialTermsScenario !== null)
  document.cookie = `dall-fit-mock-terms=${encodeURIComponent(initialTermsScenario)}; Path=/; SameSite=Lax`;

export const mockWorker = setupWorker(...handlers);
