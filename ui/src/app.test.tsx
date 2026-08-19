import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '~/app';
import { AppProviders } from '~/context/providers';
import { queryClient } from '~/context/query-client';
import { router } from '~/routes/routes';

const { analyticsMock } = vi.hoisted(() => ({
  analyticsMock: vi.fn(() => null),
}));

vi.mock('@vercel/analytics/react', () => ({
  Analytics: analyticsMock,
}));

describe('App', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    analyticsMock.mockClear();
    queryClient.clear();
    window.history.replaceState({}, '', '/?mockAuth=unauthenticated');
    await router.navigate({ to: '/', search: { mockAuth: 'unauthenticated' } });
  });

  it('resolves the public root route inside the application providers', async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Entre para continuar' }),
    ).toBeInTheDocument();
    expect(analyticsMock).toHaveBeenCalledTimes(1);
  });

  afterEach(() => vi.unstubAllEnvs());
});
