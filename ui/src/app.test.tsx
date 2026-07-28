import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import App from '~/app';
import { AppProviders } from '~/context/providers';
import { queryClient } from '~/context/query-client';
import { router } from '~/routes/routes';

describe('App', () => {
  beforeEach(async () => {
    queryClient.clear();
    window.history.replaceState({}, '', '/');
    await router.navigate({ to: '/' });
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
  });
});
