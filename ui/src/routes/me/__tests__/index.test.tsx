import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { authenticatedPersonFixture } from '~/mocks/fixtures/person';
import { MePage } from '~/routes/me';

describe('MePage', () => {
  it('shows only the public profile data of the authenticated person', () => {
    render(<MePage person={authenticatedPersonFixture} />);

    expect(
      screen.getByRole('heading', { name: 'Sua conta' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Alex Runner')).toBeInTheDocument();
    expect(screen.getByText('alex.runner@example.test')).toBeInTheDocument();
    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(screen.queryByText('person-fixture-001')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('identifies an administrator without hiding their profile data', () => {
    render(
      <MePage person={{ ...authenticatedPersonFixture, isAdmin: true }} />,
    );

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Alex Runner')).toBeInTheDocument();
    expect(screen.getByText('alex.runner@example.test')).toBeInTheDocument();
  });

  it('uses initials when the person has no photo', () => {
    render(
      <MePage person={{ ...authenticatedPersonFixture, photoUrl: null }} />,
    );

    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
