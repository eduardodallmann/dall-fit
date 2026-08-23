import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PwaUpdateNotice } from '~/core/components/pwa-update-notice';
import { PwaContext, type PwaContextValue } from '~/core/pwa/pwa-context';

function renderNotice(value: Partial<PwaContextValue> = {}) {
  const context: PwaContextValue = {
    dismissUpdate: vi.fn(),
    install: vi.fn().mockResolvedValue(undefined),
    installationMode: 'manual',
    isInstalling: false,
    isUpdating: false,
    update: vi.fn().mockResolvedValue(undefined),
    updateFailed: false,
    ...value,
  };

  render(
    <PwaContext value={context}>
      <PwaUpdateNotice />
    </PwaContext>,
  );

  return context;
}

describe('PwaUpdateNotice', () => {
  it('stays absent during the normal silent update lifecycle', () => {
    renderNotice({ isUpdating: true });

    expect(
      screen.queryByText('Nova versão disponível'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers retry and continuation only after terminal activation failure', async () => {
    const user = userEvent.setup();
    const context = renderNotice({ updateFailed: true });

    expect(screen.getByText('Não foi possível atualizar')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Você pode continuar usando esta versão e tentar novamente.',
      ),
    ).toBeInTheDocument();
    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('aria-live', 'polite');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(context.update).toHaveBeenCalledOnce();
    expect(context.dismissUpdate).toHaveBeenCalledOnce();
  });

  it('prevents concurrent retry and continuation while retry is pending', async () => {
    const user = userEvent.setup();
    const context = renderNotice({ isUpdating: true, updateFailed: true });
    const retryAction = screen.getByRole('button', {
      name: 'Tentar novamente',
    });
    const continueAction = screen.getByRole('button', { name: 'Continuar' });

    expect(retryAction).toHaveAttribute('aria-disabled', 'true');
    expect(continueAction).toBeDisabled();

    await user.click(retryAction);
    await user.click(continueAction);

    expect(context.update).not.toHaveBeenCalled();
    expect(context.dismissUpdate).not.toHaveBeenCalled();
  });
});
