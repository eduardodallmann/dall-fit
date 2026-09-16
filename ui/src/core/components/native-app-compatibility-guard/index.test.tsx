import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NativeAppCompatibilityGuard } from '~/core/components/native-app-compatibility-guard';
import type { NativeAppCompatibilitySnapshot } from '~/core/platform/native/app-compatibility';
import { NativeAppCompatibilityContext } from '~/core/platform/native/app-compatibility-context';
import {
  createPlatformSnapshot,
  PlatformContext,
} from '~/core/platform/platform';

const blocked: NativeAppCompatibilitySnapshot = {
  checking: false,
  installedVersionCode: 1,
  installedVersionName: '1.0',
  minimumVersionCode: 2,
  recoveryRequired: false,
  storeOpenFailed: false,
  storeUrl: 'https://play.google.com/store/apps/details?id=com.dallfit.app',
  syncContractVersion: 1 as const,
  updateRequired: true,
};

function renderGuard(
  snapshot: NativeAppCompatibilitySnapshot,
  openStore = vi.fn().mockResolvedValue(true),
  acknowledgeRecovery = vi.fn().mockResolvedValue(undefined),
) {
  const coordinator = {
    acknowledgeRecovery,
    getSnapshot: () => snapshot,
    openStore,
    subscribe: () => () => undefined,
  };
  render(
    <PlatformContext value={createPlatformSnapshot('android', true)}>
      <NativeAppCompatibilityContext value={coordinator as never}>
        <NativeAppCompatibilityGuard>
          <div>Conteúdo privado</div>
        </NativeAppCompatibilityGuard>
      </NativeAppCompatibilityContext>
    </PlatformContext>,
  );
  return openStore;
}

describe('NativeAppCompatibilityGuard', () => {
  it('replaces all content and focuses the mandatory update surface', async () => {
    window.history.replaceState({}, '', '/dash');
    const openStore = renderGuard(blocked);
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Atualização necessária' }),
    ).toHaveFocus();

    await userEvent.click(
      screen.getByRole('button', { name: 'Atualizar na Play Store' }),
    );
    expect(openStore).toHaveBeenCalledTimes(1);
  });

  it('keeps only the captured active workout route available', () => {
    window.history.replaceState({}, '', '/training/workout/workout-a');
    renderGuard({ ...blocked, activeWorkoutId: 'workout-a' });
    expect(screen.getByText('Conteúdo privado')).toBeInTheDocument();
  });

  it('keeps a failed store action visible and repeatable', () => {
    window.history.replaceState({}, '', '/training');
    renderGuard({ ...blocked, storeOpenFailed: true });
    expect(
      screen.getByText('Não foi possível abrir a loja'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Atualizar na Play Store' }),
    ).toBeEnabled();
  });

  it('requires explicit acknowledgement after an unrecoverable migration reset', async () => {
    window.history.replaceState({}, '', '/training');
    const acknowledgeRecovery = vi.fn().mockResolvedValue(undefined);
    renderGuard(
      { ...blocked, recoveryRequired: true, updateRequired: false },
      undefined,
      acknowledgeRecovery,
    );

    expect(
      screen.getByRole('heading', { name: 'Dados offline redefinidos' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/treinos que ainda não tinham sido enviados/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(acknowledgeRecovery).toHaveBeenCalledTimes(1);
  });
});
