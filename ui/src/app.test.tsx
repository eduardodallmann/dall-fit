import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '~/app';
import { AppProviders } from '~/context/providers';

describe('App', () => {
  it('resolves the root route inside the application providers', async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Get started' }),
    ).toBeInTheDocument();
  });
});
