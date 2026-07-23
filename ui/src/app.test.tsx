import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import App from './app';

describe('App', () => {
  it('renders the starter screen and increments the counter', async () => {
    const user = userEvent.setup();

    render(<App />);

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
