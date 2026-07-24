import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HomePage } from '~/routes/home';

describe('HomePage', () => {
  it('renders the starter screen and increments the counter', async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: 'Get started' }),
    ).toBeInTheDocument();

    const counter = screen.getByRole('button', { name: 'Count is 0' });
    await user.click(counter);

    expect(
      screen.getByRole('button', { name: 'Count is 1' }),
    ).toBeInTheDocument();
  });
});
