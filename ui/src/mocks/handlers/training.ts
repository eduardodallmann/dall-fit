import { http, HttpResponse } from 'msw';

import type {
  TrainingExerciseExecution,
  TrainingSession,
} from '@dall-fit/types';

import {
  createTrainingOverviewFixture,
  createTrainingPreviewFixture,
  createTrainingSessionFixture,
  createWorkoutCompletionFixture,
} from '~/mocks/fixtures/training';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

const apiBaseUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');

interface TrainingState {
  completion: ReturnType<typeof createWorkoutCompletionFixture>;
  session: TrainingSession | null;
}

const states = new Map<string, TrainingState>();

export function resetTrainingScenarioStates(): void {
  states.clear();
}

function scenario(request: Request): string {
  return request.headers.get('x-dall-fit-mock-training') ?? 'active-plan';
}

function stateFor(name: string): TrainingState {
  const existing = states.get(name);
  if (existing !== undefined) return existing;
  const running = [
    'duration-running',
    'exercise-completed',
    'pause-running',
    'series-running',
    'session-running',
    'workout-complete',
    'workout-incomplete',
    'youtube-long-running',
  ].includes(name);
  const result = {
    completion: createWorkoutCompletionFixture(),
    session: running ? createTrainingSessionFixture(name) : null,
  };
  states.set(name, result);
  return result;
}

function error(code: string, message: string, status: number) {
  return HttpResponse.json(
    createMockApiError(code, message),
    createMockResponseInit({ status }),
  );
}

function sessionResponse(session: TrainingSession) {
  return HttpResponse.json(
    { data: session },
    createMockResponseInit({
      headers: { 'X-Resource-Version': String(session.version) },
    }),
  );
}

function validateVersion(request: Request, session: TrainingSession) {
  const version = request.headers.get('x-resource-version');
  if (version === null)
    return error('PRECONDITION_REQUIRED', 'Version is required.', 428);
  if (Number(version) !== session.version)
    return error(
      'WORKOUT_SESSION_VERSION_CONFLICT',
      'Workout session version conflict.',
      409,
    );
  return null;
}

function updateSession(
  state: TrainingState,
  mutate: (session: TrainingSession) => TrainingSession,
): TrainingSession {
  if (state.session === null) throw new Error('Mock session is missing.');
  state.session = {
    ...mutate(state.session),
    serverNow: new Date().toISOString(),
    version: state.session.version + 1,
  };
  return state.session;
}

function replaceExercise(
  session: TrainingSession,
  exerciseId: string,
  next: TrainingExerciseExecution,
): TrainingSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id === exerciseId ? next : exercise,
    ),
  };
}

export const trainingHandlers = [
  http.get(`${apiBaseUrl}/training`, ({ request }) => {
    const name = scenario(request);
    if (name === 'no-active-plan')
      return HttpResponse.json({ data: { plan: null, workouts: [] } });
    const state = stateFor(name);
    return HttpResponse.json({
      data: createTrainingOverviewFixture(state.session !== null),
    });
  }),

  http.get(`${apiBaseUrl}/training/workouts/:workoutId`, () =>
    HttpResponse.json({ data: createTrainingPreviewFixture() }),
  ),

  http.post(
    `${apiBaseUrl}/training/workouts/:workoutId/session`,
    ({ request }) => {
      const state = stateFor(scenario(request));
      if (state.session !== null)
        return error(
          'WORKOUT_SESSION_ALREADY_ACTIVE',
          'A session is already active.',
          409,
        );
      state.session = createTrainingSessionFixture('session-running');
      return sessionResponse(state.session);
    },
  ),

  http.get(`${apiBaseUrl}/training/session`, ({ request }) => {
    const name = scenario(request);
    if (name === 'session-expired')
      return error('WORKOUT_SESSION_EXPIRED', 'Session expired.', 410);
    const state = stateFor(name);
    return state.session === null
      ? error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404)
      : sessionResponse(state.session);
  }),

  http.delete(`${apiBaseUrl}/training/session`, ({ request }) => {
    const state = stateFor(scenario(request));
    state.session = null;
    return new HttpResponse(null, createMockResponseInit({ status: 204 }));
  }),

  http.put(
    `${apiBaseUrl}/training/session/exercises/:exerciseId/series/:seriesNumber/load`,
    async ({ params, request }) => {
      const state = stateFor(scenario(request));
      if (state.session === null)
        return error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404);
      const invalid = validateVersion(request, state.session);
      if (invalid !== null) return invalid;
      const body = (await request.json()) as { loadKg: number | null };
      const exerciseId = String(params.exerciseId);
      const seriesNumber = Number(params.seriesNumber);
      const next = updateSession(state, (session) => {
        const exercise = session.exercises.find(
          (item) => item.id === exerciseId,
        );
        if (exercise?.type !== 'image' && exercise?.type !== 'youtube-short')
          return session;
        return replaceExercise(session, exerciseId, {
          ...exercise,
          series: exercise.series.map((series) =>
            series.number === seriesNumber
              ? { ...series, loadKg: body.loadKg }
              : series,
          ),
        });
      });
      return sessionResponse(next);
    },
  ),

  http.post(
    `${apiBaseUrl}/training/session/exercises/:exerciseId/series/:seriesNumber/complete`,
    async ({ params, request }) => {
      const state = stateFor(scenario(request));
      if (state.session === null)
        return error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404);
      const invalid = validateVersion(request, state.session);
      if (invalid !== null) return invalid;
      const body = (await request.json()) as { loadKg: number | null };
      const exerciseId = String(params.exerciseId);
      const seriesNumber = Number(params.seriesNumber);
      const now = new Date();
      const next = updateSession(state, (session) => {
        const exercise = session.exercises.find(
          (item) => item.id === exerciseId,
        );
        if (exercise?.type !== 'image' && exercise?.type !== 'youtube-short')
          return session;
        const series = exercise.series.map((item) =>
          item.number === seriesNumber
            ? { ...item, completedAt: now.toISOString(), loadKg: body.loadKg }
            : item,
        );
        const complete = series.every((item) => item.completedAt !== null);
        const updated = replaceExercise(session, exerciseId, {
          ...exercise,
          completedAt: complete ? now.toISOString() : null,
          series,
        });
        return complete
          ? updated
          : {
              ...updated,
              activeTimer: {
                endsAt: new Date(
                  now.getTime() + exercise.restSeconds * 1000,
                ).toISOString(),
                exerciseId,
                kind: 'series-rest',
                seriesNumber,
                startedAt: now.toISOString(),
              },
            };
      });
      return sessionResponse(next);
    },
  ),

  http.post(
    `${apiBaseUrl}/training/session/exercises/:exerciseId/series/complete-remaining`,
    async ({ params, request }) => {
      const state = stateFor(scenario(request));
      if (state.session === null)
        return error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404);
      const invalid = validateVersion(request, state.session);
      if (invalid !== null) return invalid;
      const body = (await request.json()) as {
        loadsKg: readonly (number | null)[];
      };
      const exerciseId = String(params.exerciseId);
      const now = new Date().toISOString();
      const next = updateSession(state, (session) => {
        const exercise = session.exercises.find(
          (item) => item.id === exerciseId,
        );
        if (exercise?.type !== 'image' && exercise?.type !== 'youtube-short')
          return session;
        return replaceExercise(session, exerciseId, {
          ...exercise,
          completedAt: now,
          series: exercise.series.map((series, index) => ({
            ...series,
            completedAt: now,
            loadKg: body.loadsKg[index] ?? null,
          })),
        });
      });
      return sessionResponse(next);
    },
  ),

  http.post(
    `${apiBaseUrl}/training/session/exercises/:exerciseId/timer`,
    async ({ params, request }) => {
      const state = stateFor(scenario(request));
      if (state.session === null)
        return error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404);
      const invalid = validateVersion(request, state.session);
      if (invalid !== null) return invalid;
      const body = (await request.json()) as { kind: 'duration' | 'pause' };
      const exerciseId = String(params.exerciseId);
      const exercise = state.session.exercises.find(
        (item) => item.id === exerciseId,
      );
      let seconds = 1;
      if (exercise?.type === 'duration')
        seconds = exercise.durationMinutes * 60;
      if (exercise?.type === 'pause') seconds = exercise.restSeconds;
      const now = new Date();
      const next = updateSession(state, (session) => ({
        ...session,
        activeTimer: {
          endsAt: new Date(now.getTime() + seconds * 1000).toISOString(),
          exerciseId,
          kind: body.kind,
          startedAt: now.toISOString(),
        },
      }));
      return sessionResponse(next);
    },
  ),

  http.post(
    `${apiBaseUrl}/training/session/timer/resolve`,
    async ({ request }) => {
      const state = stateFor(scenario(request));
      if (state.session === null)
        return error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404);
      const invalid = validateVersion(request, state.session);
      if (invalid !== null) return invalid;
      const body = (await request.json()) as {
        outcome: 'cancel' | 'finish' | 'skip';
      };
      const next = updateSession(state, (session) => {
        const timer = session.activeTimer;
        if (timer === null) return session;
        if (timer.kind === 'duration' && body.outcome === 'cancel')
          return { ...session, activeTimer: null };
        if (timer.kind === 'series-rest')
          return { ...session, activeTimer: null };
        const exercise = session.exercises.find(
          (item) => item.id === timer.exerciseId,
        );
        if (exercise === undefined) return { ...session, activeTimer: null };
        return replaceExercise({ ...session, activeTimer: null }, exercise.id, {
          ...exercise,
          completedAt: new Date().toISOString(),
        });
      });
      return sessionResponse(next);
    },
  ),

  http.post(
    `${apiBaseUrl}/training/session/exercises/:exerciseId/complete`,
    ({ params, request }) => mutateExerciseCompletion(params, request, true),
  ),

  http.post(
    `${apiBaseUrl}/training/session/exercises/:exerciseId/restart`,
    ({ params, request }) => mutateExerciseCompletion(params, request, false),
  ),

  http.post(`${apiBaseUrl}/training/session/complete`, ({ request }) => {
    const state = stateFor(scenario(request));
    if (state.session === null)
      return error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404);
    const invalid = validateVersion(request, state.session);
    if (invalid !== null) return invalid;
    state.completion = {
      ...state.completion,
      completedExerciseCount: state.session.exercises.filter(
        (exercise) => exercise.completedAt !== null,
      ).length,
      fullCompletion: state.session.exercises.every(
        (exercise) => exercise.completedAt !== null,
      ),
    };
    state.session = null;
    return HttpResponse.json({ data: state.completion });
  }),

  http.get(`${apiBaseUrl}/training/completions/:executionId`, ({ request }) => {
    const state = stateFor(scenario(request));
    return HttpResponse.json({ data: state.completion });
  }),
];

function mutateExerciseCompletion(
  params: Record<string, string | readonly string[] | undefined>,
  request: Request,
  complete: boolean,
) {
  const state = stateFor(scenario(request));
  if (state.session === null)
    return error('WORKOUT_SESSION_NOT_FOUND', 'Session not found.', 404);
  const invalid = validateVersion(request, state.session);
  if (invalid !== null) return invalid;
  const exerciseId = String(params.exerciseId);
  const next = updateSession(state, (session) => {
    const exercise = session.exercises.find((item) => item.id === exerciseId);
    if (exercise === undefined) return session;
    const completedAt = complete ? new Date().toISOString() : null;
    return replaceExercise(session, exerciseId, {
      ...exercise,
      completedAt,
      ...('series' in exercise
        ? {
            series: exercise.series.map((series) => ({
              ...series,
              completedAt,
            })),
          }
        : {}),
    });
  });
  return sessionResponse(next);
}
