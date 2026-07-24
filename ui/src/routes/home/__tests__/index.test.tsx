import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '~/context/providers';
import { HomePage } from '~/routes/home';

describe('HomePage', () => {
  it('renders the public login entry', () => {
    render(
      <AppProviders>
        <HomePage />
      </AppProviders>,
    );

    expect(
      screen.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Não foi possível entrar.'),
    ).not.toBeInTheDocument();
  });

  it('shows a recoverable callback error without removing the login action', () => {
    render(
      <AppProviders>
        <HomePage hasAuthError />
      </AppProviders>,
    );

    expect(screen.getByText('Não foi possível entrar.')).toBeInTheDocument();
    expect(screen.getByText('Tente novamente.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeInTheDocument();
  });
});
