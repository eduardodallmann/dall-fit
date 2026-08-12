import { delay, http, HttpResponse } from 'msw';

import type {
  CreateExerciseRequest,
  CreateTrainingPlanRequest,
  Exercise,
  ReorderExercisesRequest,
  TrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutDetails,
  UpdateExerciseRequest,
  UpdateTrainingPlanRequest,
} from '@dall-fit/types';

import {
  largeTrainingPlanFixtures,
  trainingPlanCollectionFixture,
  trainingPlanDetailFixture,
  trainingPlanFixtures,
  trainingPlanWorkoutFixture,
} from '~/mocks/fixtures/training-plans';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

interface ScenarioState {
  detail: TrainingPlanDetails;
  plans: TrainingPlanSummary[];
  workout: TrainingPlanWorkoutDetails;
  nextExerciseNumber: number;
}

const scenarioStates = new Map<string, ScenarioState>();
export function resetTrainingPlanScenarioStates(): void {
  scenarioStates.clear();
}
function getScenario(request: Request): string {
  return request.headers.get('x-dall-fit-mock-training-plans') ?? 'success';
}

function getState(scenario: string): ScenarioState {
  const existing = scenarioStates.get(scenario);
  if (existing !== undefined) return existing;
  const result = {
    detail: {
      ...trainingPlanDetailFixture,
      workouts: [...trainingPlanDetailFixture.workouts],
    },
    plans: trainingPlanFixtures.map((plan) => ({ ...plan })),
    workout: {
      ...trainingPlanWorkoutFixture,
      exercises: trainingPlanWorkoutFixture.exercises.map((exercise) => ({
        ...exercise,
      })),
    },
    nextExerciseNumber: 30,
  };
  scenarioStates.set(scenario, result);
  return result;
}

function apiError(code: string, message: string, status: number) {
  return HttpResponse.json(
    createMockApiError(code, message),
    createMockResponseInit({ status }),
  );
}

function responseInit(version: number, status = 200): ResponseInit {
  return createMockResponseInit({
    status,
    headers: { 'X-Resource-Version': String(version) },
  });
}

function validateMutation(
  request: Request,
  state: ScenarioState,
  scenario: string,
): Response | null {
  if (scenario === 'version-conflict')
    return apiError(
      'TRAINING_PLAN_VERSION_CONFLICT',
      'Training plan version conflict.',
      412,
    );
  const value = request.headers.get('x-resource-version');
  if (value === null)
    return apiError(
      'PRECONDITION_REQUIRED',
      'X-Resource-Version is required.',
      428,
    );
  if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)))
    return apiError('VALIDATION_ERROR', 'Request validation failed.', 400);
  if (Number(value) !== state.detail.version)
    return apiError(
      'TRAINING_PLAN_VERSION_CONFLICT',
      'Training plan version conflict.',
      412,
    );
  return null;
}

function increment(state: ScenarioState): number {
  const version = state.detail.version + 1;
  state.detail = {
    ...state.detail,
    version,
    updatedAt: new Date().toISOString(),
  };
  state.workout = {
    ...state.workout,
    version,
    updatedAt: new Date().toISOString(),
  };
  state.plans = state.plans.map((plan) =>
    plan.id === state.detail.id
      ? { ...plan, version, updatedAt: state.detail.updatedAt }
      : plan,
  );
  return version;
}

function defaultExercise(
  type: CreateExerciseRequest['type'],
  state: ScenarioState,
): Exercise {
  const id = `64b0000000000000000002${String(state.nextExerciseNumber).padStart(2, '0')}`;
  state.nextExerciseNumber += 1;
  switch (type) {
    case 'youtube-short':
      return {
        id,
        type,
        name: 'Novo exercício',
        youtubeId: 'ZA8gs8XP2bs',
        bodyArea: 'other',
        restSeconds: 60,
        sets: 3,
        repetitions: 12,
      };
    case 'image':
      return {
        id,
        type,
        name: 'Novo exercício',
        image: null,
        bodyArea: 'other',
        restSeconds: 60,
        sets: 3,
        repetitions: 12,
      };
    case 'youtube-long':
      return {
        id,
        type,
        name: 'Novo exercício',
        youtubeId: '2isq0vuKruE',
        bodyArea: 'other',
      };
    case 'pause':
      return { id, type, restSeconds: 60 };
    case 'duration':
      return {
        id,
        type,
        name: 'Novo exercício',
        bodyArea: 'other',
        durationMinutes: 15,
      };
  }
}

export const trainingPlanHandlers = [
  http.get('*/global/training-plans', async ({ request }) => {
    const scenario = getScenario(request);
    await delay(scenario === 'loading' ? 600 : 75);
    if (scenario === 'list-error')
      return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    const state = getState(scenario);
    const plans =
      scenario === 'large-pagination' ? largeTrainingPlanFixtures : state.plans;
    return HttpResponse.json(
      trainingPlanCollectionFixture(scenario === 'empty' ? [] : plans, page),
      createMockResponseInit(),
    );
  }),
  http.post('*/global/training-plans', async ({ request }) => {
    const scenario = getScenario(request);
    await delay(75);
    if (scenario === 'create-error')
      return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
    const input = (await request.json()) as CreateTrainingPlanRequest;
    const now = new Date().toISOString();
    const created: TrainingPlanSummary = {
      ...input,
      id: '64b000000000000000000099',
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    getState(scenario).plans.unshift(created);
    return HttpResponse.json({ data: created }, responseInit(0, 201));
  }),
  http.get(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(scenario === 'loading' ? 600 : 75);
      if (scenario === 'detail-error')
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      const state = getState(scenario);
      if (params.trainingPlanId !== state.detail.id)
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      if (params.workoutId !== state.workout.id)
        return apiError('WORKOUT_NOT_FOUND', 'Workout not found.', 404);
      return HttpResponse.json(
        { data: state.workout },
        responseInit(state.detail.version),
      );
    },
  ),
  http.patch(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId',
    async ({ request }) => {
      const scenario = getScenario(request);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const { name } = (await request.json()) as { name: string };
      const version = increment(state);
      state.workout = { ...state.workout, name };
      state.detail = {
        ...state.detail,
        workouts: state.detail.workouts.map((workout) =>
          workout.id === state.workout.id ? { ...workout, name } : workout,
        ),
      };
      return HttpResponse.json(
        {
          data: {
            id: state.workout.id,
            name,
            updatedAt: state.workout.updatedAt,
          },
        },
        responseInit(version),
      );
    },
  ),
  http.post(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises',
    async ({ request }) => {
      const scenario = getScenario(request);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      if (state.workout.exercises.length >= 50)
        return apiError(
          'EXERCISE_LIMIT_REACHED',
          'Exercise limit reached.',
          409,
        );
      const input = (await request.json()) as CreateExerciseRequest;
      const exercise = defaultExercise(input.type, state);
      state.workout = {
        ...state.workout,
        exercises: [...state.workout.exercises, exercise],
      };
      const version = increment(state);
      return HttpResponse.json({ data: exercise }, responseInit(version, 201));
    },
  ),
  http.put(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/order',
    async ({ request }) => {
      const scenario = getScenario(request);
      if (scenario === 'reorder-error') {
        await delay(300);
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      }
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const input = (await request.json()) as ReorderExercisesRequest;
      const byId = new Map(
        state.workout.exercises.map((exercise) => [exercise.id, exercise]),
      );
      if (
        new Set(input.exerciseIds).size !== state.workout.exercises.length ||
        input.exerciseIds.some((id) => !byId.has(id))
      )
        return apiError(
          'INVALID_EXERCISE_ORDER',
          'Exercise order is invalid.',
          400,
        );
      const same = input.exerciseIds.every(
        (id, index) => state.workout.exercises[index]?.id === id,
      );
      if (!same) {
        state.workout = {
          ...state.workout,
          exercises: input.exerciseIds.map((id) => byId.get(id) as Exercise),
        };
        increment(state);
      }
      return new HttpResponse(null, responseInit(state.detail.version, 204));
    },
  ),
  http.patch(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(75);
      if (scenario === 'update-exercise-error')
        return new HttpResponse('PRECONDITION_FAILED', {
          status: 412,
          headers: { 'x-vercel-error': 'PRECONDITION_FAILED' },
        });
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const changes = (await request.json()) as UpdateExerciseRequest;
      const index = state.workout.exercises.findIndex(
        (exercise) => exercise.id === params.exerciseId,
      );
      if (index < 0)
        return apiError('EXERCISE_NOT_FOUND', 'Exercise not found.', 404);
      const updated = {
        ...state.workout.exercises[index],
        ...changes,
      } as Exercise;
      state.workout = {
        ...state.workout,
        exercises: state.workout.exercises.map((exercise, itemIndex) =>
          itemIndex === index ? updated : exercise,
        ),
      };
      const version = increment(state);
      return HttpResponse.json({ data: updated }, responseInit(version));
    },
  ),
  http.delete(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId',
    ({ params, request }) => {
      const scenario = getScenario(request);
      if (scenario === 'delete-exercise-error')
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const exercises = state.workout.exercises.filter(
        (exercise) => exercise.id !== params.exerciseId,
      );
      if (exercises.length === state.workout.exercises.length)
        return apiError('EXERCISE_NOT_FOUND', 'Exercise not found.', 404);
      state.workout = { ...state.workout, exercises };
      const version = increment(state);
      return new HttpResponse(null, responseInit(version, 204));
    },
  ),
  http.put(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      if (scenario === 'image-error')
        return apiError('IMAGE_UPLOAD_FAILED', 'Image upload failed.', 503);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const form = await request.formData();
      if (!(form.get('file') instanceof File))
        return apiError('VALIDATION_ERROR', 'Request validation failed.', 400);
      const image = {
        thumbnailUrl:
          'https://gvi3tyf5ckqiqlak.public.blob.vercel-storage.com/exercise-images/thumbnail.webp',
        displayUrl:
          'https://gvi3tyf5ckqiqlak.public.blob.vercel-storage.com/exercise-images/display.webp',
      };
      state.workout = {
        ...state.workout,
        exercises: state.workout.exercises.map((exercise) =>
          exercise.id === params.exerciseId && exercise.type === 'image'
            ? { ...exercise, image }
            : exercise,
        ),
      };
      const version = increment(state);
      return HttpResponse.json({ data: { image } }, responseInit(version));
    },
  ),
  http.delete(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image',
    ({ params, request }) => {
      const scenario = getScenario(request);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const target = state.workout.exercises.find(
        (exercise) => exercise.id === params.exerciseId,
      );
      if (target?.type !== 'image')
        return apiError(
          'INVALID_EXERCISE_TYPE',
          'Exercise type is invalid.',
          400,
        );
      if (target.image !== null) {
        state.workout = {
          ...state.workout,
          exercises: state.workout.exercises.map((exercise) =>
            exercise.id === target.id && exercise.type === 'image'
              ? { ...exercise, image: null }
              : exercise,
          ),
        };
        increment(state);
      }
      return new HttpResponse(null, responseInit(state.detail.version, 204));
    },
  ),
  http.get(
    '*/global/training-plans/:trainingPlanId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(scenario === 'loading' ? 600 : 75);
      if (scenario === 'detail-error')
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      if (scenario === 'not-found')
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      const state = getState(scenario);
      const plan = state.plans.find(
        (item) => item.id === params.trainingPlanId,
      );
      if (plan === undefined)
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      const detail =
        plan.id === state.detail.id
          ? { ...state.detail, ...plan }
          : { ...plan, workouts: [] };
      return HttpResponse.json({ data: detail }, responseInit(plan.version));
    },
  ),
  http.patch(
    '*/global/training-plans/:trainingPlanId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(300);
      if (scenario === 'update-error')
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const changes = (await request.json()) as UpdateTrainingPlanRequest;
      const index = state.plans.findIndex(
        (item) => item.id === params.trainingPlanId,
      );
      if (index < 0)
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      const version = increment(state);
      const updated = {
        ...state.plans[index],
        ...changes,
        version,
        updatedAt: new Date().toISOString(),
      };
      state.plans[index] = updated;
      state.detail = { ...state.detail, ...updated };
      state.workout = {
        ...state.workout,
        trainingPlan: { id: updated.id, name: updated.name },
      };
      return HttpResponse.json({ data: updated }, responseInit(version));
    },
  ),
  http.delete(
    '*/global/training-plans/:trainingPlanId',
    ({ params, request }) => {
      const scenario = getScenario(request);
      if (scenario === 'delete-error')
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const original = state.plans.length;
      state.plans = state.plans.filter(
        (item) => item.id !== params.trainingPlanId,
      );
      if (state.plans.length === original)
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      return new HttpResponse(null, createMockResponseInit({ status: 204 }));
    },
  ),
  http.post(
    '*/global/training-plans/:trainingPlanId/workouts',
    ({ params, request }) => {
      const scenario = getScenario(request);
      if (scenario === 'create-workout-error')
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      if (state.detail.id !== params.trainingPlanId)
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      const workout = {
        exerciseCount: 0,
        id: '64b000000000000000000199',
        name: 'Novo treino',
      };
      state.detail = {
        ...state.detail,
        workouts: [...state.detail.workouts, workout],
      };
      state.workout = {
        id: workout.id,
        name: workout.name,
        version: state.detail.version,
        trainingPlan: { id: state.detail.id, name: state.detail.name },
        exercises: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const version = increment(state);
      return HttpResponse.json({ data: workout }, responseInit(version, 201));
    },
  ),
  http.delete(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId',
    ({ params, request }) => {
      const scenario = getScenario(request);
      if (scenario === 'delete-workout-error')
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const workouts = state.detail.workouts.filter(
        (item) => item.id !== params.workoutId,
      );
      if (workouts.length === state.detail.workouts.length)
        return apiError('WORKOUT_NOT_FOUND', 'Workout not found.', 404);
      state.detail = { ...state.detail, workouts };
      const version = increment(state);
      return new HttpResponse(null, responseInit(version, 204));
    },
  ),
];
