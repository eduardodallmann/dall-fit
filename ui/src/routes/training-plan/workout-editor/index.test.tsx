import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrainingPlanWorkoutDetails } from '@dall-fit/types';

import { updateTrainingPlanWorkout } from '~/routes/training-plan/training-plan-service';
import { WorkoutEditor } from '~/routes/training-plan/workout-editor';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useBlocker: vi.fn(() => ({ status: 'idle' })),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

vi.mock('~/routes/training-plan/training-plan-service', () => ({
  createTrainingPlanExercise: vi.fn(),
  deleteTrainingPlanExercise: vi.fn(),
  removeTrainingPlanExerciseImage: vi.fn(),
  reorderTrainingPlanExercises: vi.fn(),
  updateTrainingPlanExercise: vi.fn(),
  updateTrainingPlanWorkout: vi.fn(),
  uploadTrainingPlanExerciseImage: vi.fn(),
}));

const workout: TrainingPlanWorkoutDetails = {
  createdAt: '2026-08-01T12:00:00.000Z',
  exercises: [],
  id: 'workout-1',
  name: 'Nome inicial',
  trainingPlan: { id: 'plan-1', name: 'Plano' },
  updatedAt: '2026-08-01T12:00:00.000Z',
  version: 0,
};

describe('WorkoutEditor workout name', () => {
  beforeEach(() => {
    trackUiEventMock.mockClear();
    vi.mocked(updateTrainingPlanWorkout).mockReset();
  });

  it('rolls a failed second save back to the last confirmed name', async () => {
    const user = userEvent.setup();
    vi.mocked(updateTrainingPlanWorkout)
      .mockResolvedValueOnce({
        data: {
          id: workout.id,
          name: 'Primeiro nome salvo',
          updatedAt: '2026-08-01T12:01:00.000Z',
        },
        version: 1,
      })
      .mockRejectedValueOnce(new Error('save failed'));
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <WorkoutEditor
          data={workout}
          mockScenario="success"
          onImageLoadError={vi.fn()}
          onRetryImage={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Editar nome do treino' }),
    );
    const name = screen.getByRole('textbox', { name: 'Nome do treino' });
    await user.clear(name);
    await user.type(name, 'Primeiro nome salvo');
    await user.click(
      screen.getByRole('button', { name: 'Salvar nome do treino' }),
    );
    await screen.findByRole('heading', { name: 'Primeiro nome salvo' });

    await user.click(
      screen.getByRole('button', { name: 'Editar nome do treino' }),
    );
    const secondName = screen.getByRole('textbox', {
      name: 'Nome do treino',
    });
    await user.clear(secondName);
    await user.type(secondName, 'Segundo nome com falha');
    await user.click(
      screen.getByRole('button', { name: 'Salvar nome do treino' }),
    );
    await waitFor(() =>
      expect(updateTrainingPlanWorkout).toHaveBeenCalledTimes(2),
    );
    await screen.findByRole('textbox', { name: 'Nome do treino' });

    await user.click(
      screen.getByRole('button', { name: 'Cancelar edição do nome' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Primeiro nome salvo' }),
    ).toBeVisible();
  });
});

describe('WorkoutEditor presentation', () => {
  it('edits the workout name without a visible field label', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <WorkoutEditor
          data={workout}
          mockScenario="success"
          onImageLoadError={vi.fn()}
          onRetryImage={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Editar nome do treino' }),
    );

    expect(
      screen.getByRole('textbox', { name: 'Nome do treino' }),
    ).toBeVisible();
    expect(screen.queryByText('Nome do treino')).not.toBeInTheDocument();
  });

  it('shows the empty state above the informative add menu', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <WorkoutEditor
          data={workout}
          mockScenario="success"
          onImageLoadError={vi.fn()}
          onRetryImage={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Nome inicial' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Exercícios' }),
    ).toBeVisible();
    expect(screen.getByText('Nenhum exercício')).toBeVisible();
    const add = screen.getByRole('button', { name: 'Adicionar exercício' });
    await user.click(add);

    expect(
      screen.getByRole('menuitem', { name: /YouTube Short/ }),
    ).toBeVisible();
    expect(
      screen.getByText('Vídeo curto com descanso, séries e repetições.'),
    ).toBeVisible();
    expect(
      screen.getByText('Intervalo de descanso entre exercícios.'),
    ).toBeVisible();
  });

  it('opens the delete confirmation below an icon-only trigger without a visible heading', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const exercise = {
      id: 'exercise-1',
      type: 'pause' as const,
      restSeconds: 60,
    };
    render(
      <QueryClientProvider client={queryClient}>
        <WorkoutEditor
          data={{ ...workout, exercises: [exercise] }}
          mockScenario="success"
          onImageLoadError={vi.fn()}
          onRetryImage={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Excluir Pausa' }));

    expect(
      screen.getByRole('dialog', { name: 'Confirmar exclusão de Pausa' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Confirmar exclusão' }),
    ).toBeVisible();
    expect(screen.queryByText('Excluir exercício?')).not.toBeInTheDocument();
  });

  it('keeps a debouncing draft silent while preserving the edited value', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const exercise = {
      bodyArea: 'quadriceps' as const,
      id: 'exercise-1',
      name: 'Agachamento',
      repetitions: 12,
      restSeconds: 60,
      sets: 3,
      type: 'youtube-short' as const,
      youtubeId: 'ZA8gs8XP2bs',
    };
    render(
      <QueryClientProvider client={queryClient}>
        <WorkoutEditor
          data={{ ...workout, exercises: [exercise] }}
          mockScenario="success"
          onImageLoadError={vi.fn()}
          onRetryImage={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const name = screen.getByRole('textbox', { name: 'Nome' });
    await user.clear(name);
    await user.type(name, 'Agachamento atualizado');

    expect(name).toHaveValue('Agachamento atualizado');
    expect(
      screen.queryByText('Alterações aguardando autosave.'),
    ).not.toBeInTheDocument();
  });

  it('refreshes a signed image without discarding a field draft', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const expiresAt = '2026-08-14T12:15:00.000Z';
    const exercise = {
      bodyArea: 'chest' as const,
      id: 'exercise-image-1',
      image: {
        displayUrl: 'https://private.blob.test/display-old?signed=fake',
        signedUrlExpiresAt: expiresAt,
        thumbnailUrl: 'https://private.blob.test/thumb-old?signed=fake',
      },
      name: 'Supino',
      repetitions: 12,
      restSeconds: 60,
      sets: 3,
      type: 'image' as const,
    };
    const renderEditor = (thumbnailUrl: string) => (
      <QueryClientProvider client={queryClient}>
        <WorkoutEditor
          data={{
            ...workout,
            exercises: [
              {
                ...exercise,
                image: { ...exercise.image, thumbnailUrl },
              },
            ],
          }}
          mockScenario="success"
          onImageLoadError={vi.fn()}
          onRetryImage={vi.fn()}
        />
      </QueryClientProvider>
    );
    const view = render(renderEditor(exercise.image.thumbnailUrl));
    const name = screen.getByRole('textbox', { name: 'Nome' });
    await user.clear(name);
    await user.type(name, 'Supino com draft');

    const refreshedUrl = 'https://private.blob.test/thumb-new?signed=fake-new';
    view.rerender(renderEditor(refreshedUrl));

    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue(
      'Supino com draft',
    );
    expect(
      screen.getByRole('img', { name: 'Imagem de Supino com draft' }),
    ).toHaveAttribute('src', refreshedUrl);
  });
});
