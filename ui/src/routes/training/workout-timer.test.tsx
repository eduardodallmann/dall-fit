import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrainingSession } from '@dall-fit/types';

import { clearCsrfToken, setCsrfToken } from '~/auth/csrf-token';
import { activateSession } from '~/auth/session-lifecycle';
import {
  createPlatformSnapshot,
  PlatformContext,
} from '~/core/platform/platform';
import {
  createTrainingPreviewFixture,
  createTrainingSessionFixture,
  mockTrainingIds,
} from '~/mocks/fixtures/training';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';
import { mockServer } from '~/mocks/server';
import { createHttpTrainingRepository } from '~/routes/training/http-training-repository';
import {
  TrainingRepositoryContext,
  type TrainingRepository,
} from '~/routes/training/training-repository';
import { TrainingWorkoutPage } from '~/routes/training/workout-page';

function expiredPause(): TrainingSession {
  const session = createTrainingSessionFixture('pause-running');
  return {
    ...session,
    serverNow: new Date(Date.parse(session.serverNow) + 31_000).toISOString(),
  };
}

function renderWorkout(repository: TrainingRepository | null = null) {
  const platform =
    repository?.source === 'native'
      ? createPlatformSnapshot('android', true)
      : createPlatformSnapshot('web', false);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <PlatformContext value={platform}>
        <TrainingRepositoryContext value={repository}>
          <TrainingWorkoutPage
            mockTraining="pause-running"
            workoutId={mockTrainingIds.workouts[0]}
          />
        </TrainingRepositoryContext>
      </PlatformContext>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('workout timer integration', () => {
  beforeEach(async () => {
    await activateSession('person-timer', 'person');
    setCsrfToken('mock-csrf-timer');
  });
  afterEach(() => clearCsrfToken());

  it('keeps the final native pause open until confirmation and then asks before finishing the workout', async () => {
    const session = expiredPause();
    session.exercises = session.exercises.map((exercise) => ({
      ...exercise,
      completedAt: exercise.type === 'pause' ? null : session.startedAt,
    }));
    let commit!: (data: TrainingSession) => void;
    const pending = new Promise<TrainingSession>((resolve) => {
      commit = resolve;
    });
    const resolveTimer = vi
      .fn<TrainingRepository['resolveTimer']>()
      .mockReturnValue(pending);
    const completeSession = vi.fn<TrainingRepository['completeSession']>();
    const repository: TrainingRepository = {
      ...createHttpTrainingRepository('pause-running'),
      source: 'native',
      getPreview: () => Promise.resolve(createTrainingPreviewFixture()),
      getSession: () => Promise.resolve(session),
      resolveTimer,
      completeSession,
    };
    renderWorkout(repository);
    const overlay = await screen.findByRole('dialog', { name: 'Descanso' });
    await waitFor(() =>
      expect(resolveTimer).toHaveBeenCalledExactlyOnceWith('finish', 0),
    );
    expect(overlay).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Pular descanso' }),
    ).toBeDisabled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    commit({
      ...session,
      activeTimer: null,
      version: 1,
      exercises: session.exercises.map((exercise) => ({
        ...exercise,
        completedAt: session.serverNow,
      })),
    });
    expect(
      await screen.findByRole('alertdialog', { name: 'Parabéns!' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('dialog', { name: 'Descanso' }),
    ).not.toBeInTheDocument();
    expect(completeSession).not.toHaveBeenCalled();
  });

  it.each([409, 412])(
    'handles HTTP %s by status and code without replaying expiration',
    async (status) => {
      const initial = expiredPause();
      const canonical: TrainingSession = { ...expiredPause(), version: 4 };
      let reads = 0;
      const requests: Array<{
        body: string;
        version: string | null;
        csrf: string | null;
      }> = [];
      mockServer.use(
        http.get('http://localhost:4000/training/session', () => {
          reads += 1;
          return HttpResponse.json(
            { data: reads === 1 ? initial : canonical },
            createMockResponseInit(),
          );
        }),
        http.post(
          'http://localhost:4000/training/session/timer/resolve',
          async ({ request }) => {
            requests.push({
              body: await request.text(),
              version: request.headers.get('x-resource-version'),
              csrf: request.headers.get('x-csrf-token'),
            });
            if (requests.length === 1)
              return HttpResponse.json(
                createMockApiError(
                  'WORKOUT_SESSION_VERSION_CONFLICT',
                  'Version changed.',
                ),
                createMockResponseInit({ status }),
              );
            return HttpResponse.json(
              { data: { ...canonical, activeTimer: null, version: 5 } },
              createMockResponseInit(),
            );
          },
        ),
      );
      renderWorkout();
      await screen.findByRole('dialog', { name: 'Descanso' });
      await waitFor(() => expect(requests).toHaveLength(1));
      if (status === 409) await waitFor(() => expect(reads).toBe(2));
      else await screen.findByText('Não foi possível encerrar o descanso.');
      const skip = screen.getByRole('button', { name: 'Pular descanso' });
      await waitFor(() => expect(skip).toBeEnabled());
      expect(requests).toHaveLength(1);
      fireEvent.click(skip);
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Descanso' }),
        ).not.toBeInTheDocument(),
      );
      expect(requests).toEqual([
        { body: '{"outcome":"finish"}', version: '0', csrf: 'mock-csrf-timer' },
        {
          body: '{"outcome":"skip"}',
          version: status === 409 ? '4' : '0',
          csrf: 'mock-csrf-timer',
        },
      ]);
      expect(reads).toBe(status === 409 ? 2 : 1);
    },
  );
});
