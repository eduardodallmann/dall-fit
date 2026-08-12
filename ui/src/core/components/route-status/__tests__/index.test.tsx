import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  ProtectedRouteError,
  ProtectedRoutePending,
} from '~/core/components/route-status';

const { invalidateMock } = vi.hoisted(() => ({
  invalidateMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: invalidateMock }),
}));

describe('ProtectedRoutePending', () => {
  it('represents the full-page loading state with accessible skeletons', () => {
    render(<ProtectedRoutePending />);

    expect(
      screen.getByRole('status', { name: 'Carregando sua conta' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('ProtectedRouteError', () => {
  it('offers a real awaited retry action', async () => {
    const user = userEvent.setup();
    render(<ProtectedRouteError />);

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(invalidateMock).toHaveBeenCalledWith({ sync: true });
  });
});
