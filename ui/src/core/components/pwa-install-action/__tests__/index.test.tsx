import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaInstallAction } from '~/core/components/pwa-install-action';
import { PwaContext, type PwaContextValue } from '~/core/pwa/pwa-context';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

const baseContext: PwaContextValue = {
  dismissUpdate: vi.fn(),
  install: vi.fn().mockResolvedValue(undefined),
  installationMode: 'manual',
  isInstalling: false,
  isUpdating: false,
  needRefresh: false,
  update: vi.fn().mockResolvedValue(undefined),
};

function renderAction(value: Partial<PwaContextValue> = {}) {
  return render(
    <PwaContext value={{ ...baseContext, ...value }}>
      <PwaInstallAction />
    </PwaContext>,
  );
}

describe('PwaInstallAction', () => {
  beforeEach(() => {
    trackUiEventMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('activates the available native installation prompt', async () => {
    const user = userEvent.setup();
    const install = vi.fn().mockResolvedValue(undefined);
    renderAction({ install, installationMode: 'prompt' });

    await user.click(
      screen.getByRole('button', { name: 'Instalar aplicativo' }),
    );

    expect(install).toHaveBeenCalledOnce();
  });

  it('shows browser-menu instructions when no native prompt exists', async () => {
    const user = userEvent.setup();
    renderAction();

    const trigger = screen.getByRole('button', { name: 'Como instalar' });
    await user.click(trigger);

    expect(screen.getByText('Abra o menu do navegador.')).toBeVisible();
    expect(screen.getByText(/Se a opção não aparecer/)).toBeVisible();

    await user.click(trigger);
    expect(screen.getByText('Abra o menu do navegador.')).not.toBeVisible();
    expect(trackUiEventMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventName: 'ui_disclosure_toggled',
        state: 'open',
      }),
    );
    expect(trackUiEventMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventName: 'ui_disclosure_toggled',
        state: 'closed',
      }),
    );
  });

  it('shows the iOS share-menu instructions', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    });
    renderAction();

    await user.click(screen.getByRole('button', { name: 'Como instalar' }));

    expect(
      screen.getByText('Abra o menu Compartilhar do navegador.'),
    ).toBeVisible();
    expect(
      screen.getByText('Selecione Adicionar à Tela de Início.'),
    ).toBeVisible();
  });

  it('renders no installation action when already installed', () => {
    renderAction({ installationMode: 'installed' });

    expect(
      screen.queryByRole('region', { name: 'Instalação do aplicativo' }),
    ).not.toBeInTheDocument();
  });
});
