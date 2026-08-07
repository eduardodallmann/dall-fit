import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProtectedRoutePending } from '~/core/components/route-status';

describe('ProtectedRoutePending', () => {
  it('represents the full-page loading state with accessible skeletons', () => {
    render(<ProtectedRoutePending />);

    expect(
      screen.getByRole('status', { name: 'Carregando sua conta' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
