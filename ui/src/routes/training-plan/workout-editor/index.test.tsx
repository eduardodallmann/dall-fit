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
          onConflict={vi.fn()}
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
