import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { ExerciseLibrarySelection } from '@dall-fit/types';

import { setCsrfToken } from '~/auth/csrf-token';
import { activateSession } from '~/auth/session-lifecycle';
import { copyTrainingPlanExercises } from '~/routes/training-plan/training-plan-service';

import { ExerciseLibrary } from './index';

function renderLibrary(
  options: {
    capacity?: number;
    copy?: Mock<
      (selections: readonly ExerciseLibrarySelection[]) => Promise<void>
    >;
    scenario?: 'exercise-library' | 'exercise-library-copy-error';
  } = {},
) {
  const onCopy =
    options.copy ??
    vi.fn<(_selections: readonly ExerciseLibrarySelection[]) => Promise<void>>(
      () => Promise.resolve(),
    );
  const onClose = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ExerciseLibrary
        capacity={options.capacity ?? 45}
        mockScenario={options.scenario ?? 'exercise-library'}
        onClose={onClose}
        onCopy={onCopy}
        onRecover={vi.fn()}
        onUnsavedChange={vi.fn()}
        paused={false}
      />
    </QueryClientProvider>,
  );
  return { onCopy, onClose };
}

describe('Exercise library selection', () => {
  beforeEach(async () => {
    await activateSession('person-fixture', 'person');
    setCsrfToken('mock-csrf-token');
  });

  it('retains hidden selections, their order and total across body areas and searches', async () => {
    const user = userEvent.setup();
    const { onCopy } = renderLibrary();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Selecionar Agachamento' }),
    );
    await user.click(screen.getByRole('button', { name: /Área do corpo/ }));
    await user.click(await screen.findByRole('option', { name: 'Peito' }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'Selecionar Supino' }),
    );
    expect(screen.getByText('2 selecionados')).toBeVisible();
    const search = screen.getByRole('searchbox', { name: 'Buscar exercício' });
    await user.type(search, 'Corrida');
    await screen.findByText('Nenhum exercício encontrado');
    expect(screen.getByText('2 selecionados')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Copiar 2 exercícios' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Área do corpo/ }));
    await user.click(
      await screen.findByRole('option', { name: 'Todas as áreas' }),
    );
    await user.click(
      await screen.findByRole('checkbox', { name: 'Selecionar Corrida' }),
    );
    await user.clear(search);
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Selecionar Agachamento' }),
      ).toBeChecked(),
    );
    expect(screen.getByText('3 selecionados')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Copiar 3 exercícios' }),
    );
    await waitFor(() => expect(onCopy).toHaveBeenCalledOnce());
    expect(onCopy.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ groupId: 'name:agachamento' }),
      expect.objectContaining({ groupId: 'name:supino' }),
      expect.objectContaining({ groupId: 'name:corrida' }),
    ]);
  });

  it('counts hidden choices toward capacity while allowing their removal when visible again', async () => {
    const user = userEvent.setup();
    renderLibrary({ capacity: 1 });
    await user.click(
      await screen.findByRole('checkbox', { name: 'Selecionar Agachamento' }),
    );
    const search = screen.getByRole('searchbox', { name: 'Buscar exercício' });
    await user.type(search, 'Supino');
    expect(
      await screen.findByRole('checkbox', { name: 'Selecionar Supino' }),
    ).toBeDisabled();
    expect(screen.getByText('1 selecionado')).toBeVisible();
    await user.clear(search);
    const selected = await screen.findByRole('checkbox', {
      name: 'Selecionar Agachamento',
    });
    expect(selected).toBeEnabled();
    await user.click(selected);
    expect(screen.getByText('0 selecionados')).toBeVisible();
  });

  it('preserves selection on an HTTP copy failure and closes only after explicit successful retry', async () => {
    const user = userEvent.setup();
    const copy = vi.fn(
      async (selections: readonly ExerciseLibrarySelection[]) => {
        await copyTrainingPlanExercises(
          '74b000000000000000000001',
          '74b000000000000000000101',
          { selections },
          0,
          'exercise-library-copy-error',
        );
      },
    );
    const { onClose } = renderLibrary({
      copy,
      scenario: 'exercise-library-copy-error',
    });
    await user.click(
      await screen.findByRole('checkbox', { name: 'Selecionar Agachamento' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Copiar 1 exercício' }),
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(
      screen.getByRole('searchbox', { name: 'Buscar exercício' }),
    ).toBeDisabled();
    await screen.findByText(
      'Não foi possível confirmar a cópia. A seleção foi preservada.',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('1 selecionado')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Copiar 1 exercício' }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it.each(['success', 'failure'])(
    'ignores a late copy %s after the session identity changes',
    async (outcome) => {
      const user = userEvent.setup();
      let resolveCopy!: () => void;
      let rejectCopy!: (error: Error) => void;
      const copy = vi.fn(
        (_selections: readonly ExerciseLibrarySelection[]) =>
          new Promise<void>((resolve, reject) => {
            resolveCopy = resolve;
            rejectCopy = reject;
          }),
      );
      const { onClose } = renderLibrary({ copy });
      await user.click(
        await screen.findByRole('checkbox', { name: 'Selecionar Agachamento' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Copiar 1 exercício' }),
      );
      await waitFor(() => expect(copy).toHaveBeenCalledOnce());
      await activateSession('another-person-fixture', 'person');
      if (outcome === 'success') resolveCopy();
      else rejectCopy(new Error('Late response'));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled(),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
});
