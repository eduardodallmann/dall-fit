import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WebConnectivityGuard } from '~/core/components/web-connectivity-guard';
import {
  createPlatformSnapshot,
  PlatformContext,
} from '~/core/platform/platform';

describe('WebConnectivityGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces web content while offline and rereads connectivity on retry', async () => {
    const user = userEvent.setup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(
      <PlatformContext value={createPlatformSnapshot('web', false)}>
        <WebConnectivityGuard>
          <p>Conteúdo privado</p>
        </WebConnectivityGuard>
      </PlatformContext>,
    );

    expect(
      screen.getByRole('heading', { name: 'Conexão necessária' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Treinos offline estão disponíveis no aplicativo Android/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();

    online.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(screen.getByText('Conteúdo privado')).toBeInTheDocument();
  });

  it('does not block the Android application while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(
      <PlatformContext value={createPlatformSnapshot('android', true)}>
        <WebConnectivityGuard>
          <p>Treino Android</p>
        </WebConnectivityGuard>
      </PlatformContext>,
    );

    expect(screen.getByText('Treino Android')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Conexão necessária' }),
    ).not.toBeInTheDocument();
  });
});
