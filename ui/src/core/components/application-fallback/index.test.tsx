import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ApplicationErrorBoundary,
  ApplicationFallback,
} from '~/core/components/application-fallback';

const { reportSystemFailureMock } = vi.hoisted(() => ({
  reportSystemFailureMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  reportSystemFailure: reportSystemFailureMock,
}));

function BrokenChild(): never {
  throw new Error('sensitive technical detail');
}

describe('application fallback', () => {
  it('renders an accessible generic recovery action', () => {
    render(<ApplicationFallback />);

    const heading = screen.getByRole('heading', {
      name: 'Não foi possível iniciar o Dall Fit',
    });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('sensitive technical detail')).toBeNull();
  });

  it('replaces a crashed tree and reports only the render category', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ApplicationErrorBoundary>
        <BrokenChild />
      </ApplicationErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Não foi possível iniciar o Dall Fit',
      }),
    ).toBeInTheDocument();
    expect(reportSystemFailureMock).toHaveBeenCalledWith('render');
    expect(reportSystemFailureMock).toHaveBeenCalledTimes(1);
  });
});
