import { createMemoryHistory } from '@tanstack/react-router';
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
  beforeEach(() => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    analyticsMock.mockClear();
    queryClient.clear();
  });

  it('resolves the public root route inside the application providers', async () => {
    router.update({
      context: { queryClient },
      history: createMemoryHistory({
        initialEntries: ['/?mockAuth=unauthenticated'],
      }),
    });
    await router.load();

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

  it('does not mount the router or analytics when the web application is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      screen.getByRole('heading', { name: 'Conexão necessária' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Entre para continuar' }),
    ).not.toBeInTheDocument();
    expect(analyticsMock).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});
