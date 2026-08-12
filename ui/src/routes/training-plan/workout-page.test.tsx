import type * as TanStackReactQuery from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainingPlanWorkoutPage } from '~/routes/training-plan/workout-page';

const { refetchMock, trackUiEventMock, useQueryMock } = vi.hoisted(() => ({
  refetchMock: vi.fn(() => Promise.resolve({ isSuccess: true })),
  trackUiEventMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackReactQuery>();
  return { ...actual, useQuery: useQueryMock };
});

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

vi.mock('~/routes/training-plan/aggregate-mutation-coordinator', () => ({
  useAggregateMutationCoordinator: () => ({
    isPending: false,
    paused: false,
    reset: vi.fn(),
  }),
}));

vi.mock('~/routes/training-plan/components', () => ({
  TrainingPlanBreadcrumbs: () => null,
}));

vi.mock('~/routes/training-plan/workout-editor', () => ({
  WorkoutEditor: () => null,
}));

describe('TrainingPlanWorkoutPage', () => {
  beforeEach(() => {
    refetchMock.mockClear();
    trackUiEventMock.mockClear();
    useQueryMock.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: refetchMock,
    });
  });

  it('tracks an initial-load retry before refetching the workout', async () => {
    const user = userEvent.setup();
    render(
      <TrainingPlanWorkoutPage
        mockTrainingPlans="success"
        trainingPlanId="plan-1"
        workoutId="workout-1"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(trackUiEventMock).toHaveBeenCalledWith({
      control: 'retry',
      eventName: 'ui_retry_requested',
      resource: 'workout',
      surface: 'workout',
    });
    expect(refetchMock).toHaveBeenCalledOnce();
    expect(trackUiEventMock.mock.invocationCallOrder[0]).toBeLessThan(
      refetchMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
