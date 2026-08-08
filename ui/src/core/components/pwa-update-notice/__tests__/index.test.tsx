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
    needRefresh: true,
    update: vi.fn().mockResolvedValue(undefined),
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
  it('is absent while the installed worker is current', () => {
    renderNotice({ needRefresh: false });

    expect(
      screen.queryByText('Nova versão disponível'),
    ).not.toBeInTheDocument();
  });

  it('lets the person confirm or defer an available update', async () => {
    const user = userEvent.setup();
    const context = renderNotice();

    expect(screen.getByText('Nova versão disponível')).toBeInTheDocument();
    expect(
      screen.getByText('Atualize para usar a versão mais recente.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atualizar agora' }));
    await user.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(context.update).toHaveBeenCalledOnce();
    expect(context.dismissUpdate).toHaveBeenCalledOnce();
  });

  it('keeps the message before its actions in the live region', () => {
    renderNotice();

    const notice = screen.getByRole('status');
    const actions = screen.getAllByRole('button');

    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(actions.map((action) => action.textContent)).toEqual([
      'Atualizar agora',
      'Agora não',
    ]);
  });

  it('blocks both update actions while activation is pending', async () => {
    const user = userEvent.setup();
    const context = renderNotice({ isUpdating: true });
    const updateAction = screen.getByRole('button', {
      name: 'Atualizar agora',
    });
    const dismissAction = screen.getByRole('button', { name: 'Agora não' });

    expect(updateAction).toHaveAttribute('aria-disabled', 'true');
    expect(dismissAction).toBeDisabled();

    await user.click(updateAction);
    await user.click(dismissAction);

    expect(context.update).not.toHaveBeenCalled();
    expect(context.dismissUpdate).not.toHaveBeenCalled();
  });
});
