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
});
