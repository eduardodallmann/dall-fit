import { delay, http, HttpResponse } from 'msw';

import type {
  CreateExerciseRequest,
  CreateTrainingPlanRequest,
  Exercise,
  GlobalTrainingPlanDetails,
  GlobalTrainingPlanLibraryItem,
  PersonalTrainingPlanListItem,
  ReorderExercisesRequest,
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
import { refreshedMockCsrfToken } from '~/mocks/handlers/auth';
import {
  publishMockRealtimeInvalidation,
  registerMockRealtimeReplication,
} from '~/mocks/handlers/realtime';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';

interface ScenarioState {
  activeCatalogEntryId: string | null;
  detail: GlobalTrainingPlanDetails;
  plans: TrainingPlanSummary[];
  workout: TrainingPlanWorkoutDetails;
  nextExerciseNumber: number;
  workoutReadCount: number;
  cloneJobs: PersonalTrainingPlanListItem[];
}

const privateBlobOrigin =
  'https://8u9fq5re0oenmrtc.private.blob.vercel-storage.com';

function signedExerciseImage(status: 'expired' | 'fresh') {
  const expiresAt =
    status === 'expired'
      ? '2020-01-01T00:00:00.000Z'
      : new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const query =
    `vercel-blob-delegation=fake-${status}` +
    `&vercel-blob-signature=fake-${status}` +
    `&mock-status=${status}`;
  const result = {
    displayUrl: `${privateBlobOrigin}/exercise-images/display.webp?${query}`,
    signedUrlExpiresAt: expiresAt,
    thumbnailUrl: `${privateBlobOrigin}/exercise-images/thumbnail.webp?${query}`,
  };
  return result;
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
  const result: ScenarioState = {
    activeCatalogEntryId: null,
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
    workoutReadCount: 0,
    cloneJobs: [],
  };
  if (scenario === 'empty-workout') {
    result.workout = { ...result.workout, exercises: [] };
    result.detail = {
      ...result.detail,
      workouts: result.detail.workouts.map((workout) =>
        workout.id === result.workout.id
          ? { ...workout, exerciseCount: 0 }
          : workout,
      ),
    };
  }
  if (scenario === 'clone-running' || scenario === 'clone-failed') {
    const now = new Date().toISOString();
    result.cloneJobs = [
      {
        cloneJobId: '84b000000000000000000001',
        completedImages: scenario === 'clone-running' ? 1 : 0,
        createdAt: now,
        generation: 1,
        itemType: 'clone-job',
        sourceName: result.detail.name,
        state: scenario === 'clone-running' ? 'running' : 'failed',
        totalImages: 2,
        updatedAt: now,
      },
    ];
  }
  if (
    scenario === 'image-signed-url-expired' ||
    scenario === 'image-ready' ||
    scenario === 'image-error' ||
    scenario === 'personal-reference'
  ) {
    result.workout = {
      ...result.workout,
      exercises: result.workout.exercises.map((exercise) =>
        exercise.type === 'image'
          ? {
              ...exercise,
              image: signedExerciseImage(
                scenario === 'image-signed-url-expired' ? 'expired' : 'fresh',
              ),
            }
          : exercise,
      ),
    };
  }
  scenarioStates.set(scenario, result);
  return result;
}

registerMockRealtimeReplication(({ scenario, state }) => {
  if (scenario === undefined || state === undefined) return;
  scenarioStates.set(scenario, {
    activeCatalogEntryId: null,
    cloneJobs: [],
    ...structuredClone(state),
    detail: {
      ...structuredClone(state.detail),
      usage: { activePeople: 0, linkedPeople: 0 },
    },
  });
});

function synchronizeExerciseCount(state: ScenarioState): void {
  state.detail = {
    ...state.detail,
    workouts: state.detail.workouts.map((workout) =>
      workout.id === state.workout.id
        ? { ...workout, exerciseCount: state.workout.exercises.length }
        : workout,
    ),
  };
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
  if (
    scenario === 'csrf-refresh' &&
    request.headers.get('x-csrf-token') !== refreshedMockCsrfToken
  )
    return apiError('CSRF_VALIDATION_FAILED', 'CSRF token is invalid.', 403);
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

function increment(
  state: ScenarioState,
  request: Request,
  publish = true,
): number {
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
  if (publish)
    queueMicrotask(() => {
      publishMockRealtimeInvalidation(
        request,
        {
          resource: 'global-training-plan',
          resourceId: state.detail.id,
          state: 'present',
          version,
        },
        { scenario: getScenario(request), state: structuredClone(state) },
      );
    });
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
  http.get(`${privateBlobOrigin}/exercise-images/:variant`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('mock-status');
    if (status === 'expired') return new HttpResponse(null, { status: 403 });
    const transparentPixel = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
      0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
      8, 215, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0,
      0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);
    return new HttpResponse(transparentPixel, {
      headers: { 'Content-Type': 'image/png' },
    });
  }),
  http.get('*/global/training-plans', async ({ request }) => {
    const scenario = getScenario(request);
    let responseDelay: number | 'infinite' = 75;
    if (scenario === 'loading') responseDelay = 600;
    if (scenario === 'timeout') responseDelay = 'infinite';
    await delay(responseDelay);
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
    publishMockRealtimeInvalidation(
      request,
      {
        resource: 'global-training-plan',
        resourceId: created.id,
        state: 'present',
        version: created.version,
      },
      { scenario, state: structuredClone(getState(scenario)) },
    );
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
      if (
        params.trainingPlanId !== state.detail.id ||
        !state.plans.some((plan) => plan.id === params.trainingPlanId)
      )
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      if (
        params.workoutId !== state.workout.id ||
        !state.detail.workouts.some(
          (workout) => workout.id === params.workoutId,
        )
      )
        return apiError('WORKOUT_NOT_FOUND', 'Workout not found.', 404);
      const workout = state.workout;
      state.workoutReadCount += 1;
      if (
        scenario === 'image-signed-url-expired' &&
        state.workoutReadCount === 1
      ) {
        state.workout = {
          ...state.workout,
          exercises: state.workout.exercises.map((exercise) =>
            exercise.type === 'image'
              ? { ...exercise, image: signedExerciseImage('fresh') }
              : exercise,
          ),
        };
      }
      return HttpResponse.json(
        { data: { ...workout, usage: state.detail.usage } },
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
      const version = increment(state, request);
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
      synchronizeExerciseCount(state);
      const version = increment(state, request);
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
        increment(state, request);
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
      const version = increment(state, request);
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
      synchronizeExerciseCount(state);
      const version = increment(state, request);
      return new HttpResponse(null, responseInit(version, 204));
    },
  ),
  http.put(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(300);
      if (scenario === 'image-error')
        return apiError('IMAGE_UPLOAD_FAILED', 'Image upload failed.', 503);
      const state = getState(scenario);
      const invalid = validateMutation(request, state, scenario);
      if (invalid !== null) return invalid;
      const form = await request.formData();
      if (!(form.get('file') instanceof File))
        return apiError('VALIDATION_ERROR', 'Request validation failed.', 400);
      const image = signedExerciseImage('fresh');
      state.workout = {
        ...state.workout,
        exercises: state.workout.exercises.map((exercise) =>
          exercise.id === params.exerciseId && exercise.type === 'image'
            ? { ...exercise, image }
            : exercise,
        ),
      };
      const version = increment(state, request);
      return HttpResponse.json({ data: { image } }, responseInit(version));
    },
  ),
  http.delete(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId/exercises/:exerciseId/image',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(300);
      if (scenario === 'image-error')
        return apiError('IMAGE_DELETE_FAILED', 'Image delete failed.', 503);
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
        increment(state, request);
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
          : {
              ...plan,
              usage: { activePeople: 0, linkedPeople: 0 },
              workouts: [],
            };
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
      const version = increment(state, request, false);
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
      publishMockRealtimeInvalidation(
        request,
        {
          resource: 'global-training-plan',
          resourceId: updated.id,
          state: 'present',
          version,
        },
        { scenario, state: structuredClone(state) },
      );
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
      publishMockRealtimeInvalidation(
        request,
        {
          resource: 'global-training-plan',
          resourceId: String(params.trainingPlanId),
          state: 'deleted',
        },
        { scenario, state: structuredClone(state) },
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
      const version = increment(state, request);
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
      const version = increment(state, request);
      return new HttpResponse(null, responseInit(version, 204));
    },
  ),
  http.get('*/training-plans', ({ request }) => {
    const scenario = getScenario(request);
    const state = getState(scenario);
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    const owned = toPersonalPlanItem(
      state.detail,
      '74b000000000000000000001',
      'owned',
      state.activeCatalogEntryId,
    );
    const reference = toPersonalPlanItem(
      trainingPlanFixtures[1] ?? state.detail,
      '74b000000000000000000002',
      'global-reference',
      state.activeCatalogEntryId,
    );
    let items: PersonalTrainingPlanListItem[] =
      scenario === 'empty' ? [] : [owned, reference, ...state.cloneJobs];
    if (scenario === 'personal-reference') items = [reference];
    const pageSize = 20;
    return HttpResponse.json(
      {
        data: items.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: items.length,
      },
      createMockResponseInit(),
    );
  }),
  http.get('*/training-plans/library', ({ request }) => {
    const scenario = getScenario(request);
    const state = getState(scenario);
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    const availablePlans = scenario === 'library-empty' ? [] : state.plans;
    const plans = availablePlans.map((plan): GlobalTrainingPlanLibraryItem => ({
      ...plan,
      cloneBlocked: state.cloneJobs.some(
        (item) =>
          item.itemType === 'clone-job' && item.sourceName === plan.name,
      ),
      exerciseCount:
        plan.id === state.detail.id ? state.workout.exercises.length : 0,
      hiddenWorkoutCount: 0,
      referenced: plan.id === trainingPlanFixtures[1]?.id,
      workoutCount: plan.id === state.detail.id ? 1 : 0,
      workouts:
        plan.id === state.detail.id
          ? [
              {
                exerciseCount: state.workout.exercises.length,
                exercises: state.workout.exercises
                  .slice(0, 3)
                  .map((exercise) => ({
                    id: exercise.id,
                    name: exercise.type === 'pause' ? 'Pausa' : exercise.name,
                    type: exercise.type,
                  })),
                hiddenExerciseCount: Math.max(
                  0,
                  state.workout.exercises.length - 3,
                ),
                id: state.workout.id,
                name: state.workout.name,
              },
            ]
          : [],
    }));
    const pageSize = 20;
    return HttpResponse.json(
      {
        data: plans.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: plans.length,
      },
      createMockResponseInit(),
    );
  }),
  http.post('*/training-plans', async ({ request }) => {
    const scenario = getScenario(request);
    const state = getState(scenario);
    const input = (await request.json()) as CreateTrainingPlanRequest;
    const now = new Date().toISOString();
    state.detail = {
      ...state.detail,
      ...input,
      id: '64b000000000000000000099',
      version: 0,
      workouts: [],
      updatedAt: now,
      createdAt: now,
    };
    const data = toPersonalPlanItem(
      state.detail,
      '74b000000000000000000099',
      'owned',
      state.activeCatalogEntryId,
    );
    return HttpResponse.json({ data }, createMockResponseInit({ status: 201 }));
  }),
  http.post('*/training-plans/global-references', async ({ request }) => {
    const state = getState(getScenario(request));
    const input = (await request.json()) as { globalTrainingPlanId: string };
    const plan = state.plans.find(
      (item) => item.id === input.globalTrainingPlanId,
    );
    if (plan === undefined)
      return apiError(
        'TRAINING_PLAN_NOT_FOUND',
        'Training plan not found.',
        404,
      );
    const data = toPersonalPlanItem(
      plan,
      '74b000000000000000000002',
      'global-reference',
      state.activeCatalogEntryId,
    );
    return HttpResponse.json({ data }, createMockResponseInit({ status: 201 }));
  }),
  http.put('*/training-plans/active', async ({ request }) => {
    const state = getState(getScenario(request));
    const input = (await request.json()) as { catalogEntryId: string };
    state.activeCatalogEntryId = input.catalogEntryId;
    return HttpResponse.json(
      { data: { activeCatalogEntryId: input.catalogEntryId } },
      createMockResponseInit(),
    );
  }),
  http.get('*/training-plans/:catalogEntryId', ({ params, request }) => {
    const state = getState(getScenario(request));
    const source =
      params.catalogEntryId === '74b000000000000000000002'
        ? 'global-reference'
        : 'owned';
    const data = {
      ...state.detail,
      active: state.activeCatalogEntryId === params.catalogEntryId,
      catalogEntryId: String(params.catalogEntryId),
      source,
    };
    return HttpResponse.json({ data }, responseInit(state.detail.version));
  }),
  http.patch(
    '*/training-plans/:catalogEntryId',
    async ({ params, request }) => {
      if (params.catalogEntryId === '74b000000000000000000002')
        return apiError(
          'GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY',
          'Global reference is read only.',
          409,
        );
      const state = getState(getScenario(request));
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
      const changes = (await request.json()) as UpdateTrainingPlanRequest;
      const version = increment(state, request, false);
      state.detail = { ...state.detail, ...changes, version };
      return HttpResponse.json({ data: state.detail }, responseInit(version));
    },
  ),
  http.delete('*/training-plans/:catalogEntryId', ({ request }) => {
    const state = getState(getScenario(request));
    if (request.headers.has('x-resource-version')) {
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
    }
    return new HttpResponse(null, createMockResponseInit({ status: 204 }));
  }),
  http.get(
    '*/training-plans/:catalogEntryId/workouts/:workoutId',
    ({ request }) => {
      const state = getState(getScenario(request));
      return HttpResponse.json(
        { data: state.workout },
        responseInit(state.detail.version),
      );
    },
  ),
  http.post(
    '*/training-plans/:catalogEntryId/workouts',
    ({ params, request }) => {
      const state = getState(getScenario(request));
      const readOnly = rejectPersonalReference(params.catalogEntryId);
      if (readOnly !== null) return readOnly;
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
      const workout = {
        exerciseCount: 0,
        id: '64b000000000000000000199',
        name: 'Novo treino',
      };
      state.detail = {
        ...state.detail,
        workouts: [...state.detail.workouts, workout],
      };
      const version = increment(state, request, false);
      return HttpResponse.json({ data: workout }, responseInit(version, 201));
    },
  ),
  http.patch(
    '*/training-plans/:catalogEntryId/workouts/:workoutId',
    async ({ params, request }) => {
      const state = getState(getScenario(request));
      const readOnly = rejectPersonalReference(params.catalogEntryId);
      if (readOnly !== null) return readOnly;
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
      const { name } = (await request.json()) as { name: string };
      const version = increment(state, request, false);
      state.workout = { ...state.workout, name };
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
  http.delete(
    '*/training-plans/:catalogEntryId/workouts/:workoutId',
    ({ params, request }) =>
      personalNestedDelete(params.catalogEntryId, request),
  ),
  http.post(
    '*/training-plans/:catalogEntryId/workouts/:workoutId/exercises',
    async ({ params, request }) => {
      const state = getState(getScenario(request));
      const readOnly = rejectPersonalReference(params.catalogEntryId);
      if (readOnly !== null) return readOnly;
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
      const input = (await request.json()) as CreateExerciseRequest;
      const exercise = defaultExercise(input.type, state);
      state.workout = {
        ...state.workout,
        exercises: [...state.workout.exercises, exercise],
      };
      synchronizeExerciseCount(state);
      const version = increment(state, request, false);
      return HttpResponse.json({ data: exercise }, responseInit(version, 201));
    },
  ),
  http.patch(
    '*/training-plans/:catalogEntryId/workouts/:workoutId/exercises/:exerciseId',
    async ({ params, request }) => {
      const state = getState(getScenario(request));
      const readOnly = rejectPersonalReference(params.catalogEntryId);
      if (readOnly !== null) return readOnly;
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
      const changes = (await request.json()) as UpdateExerciseRequest;
      const current = state.workout.exercises.find(
        (exercise) => exercise.id === params.exerciseId,
      );
      if (current === undefined)
        return apiError('EXERCISE_NOT_FOUND', 'Exercise not found.', 404);
      const updated = { ...current, ...changes } as Exercise;
      state.workout = {
        ...state.workout,
        exercises: state.workout.exercises.map((exercise) =>
          exercise.id === updated.id ? updated : exercise,
        ),
      };
      const version = increment(state, request, false);
      return HttpResponse.json({ data: updated }, responseInit(version));
    },
  ),
  http.delete(
    '*/training-plans/:catalogEntryId/workouts/:workoutId/exercises/:exerciseId',
    ({ params, request }) => {
      const state = getState(getScenario(request));
      const readOnly = rejectPersonalReference(params.catalogEntryId);
      if (readOnly !== null) return readOnly;
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
      state.workout = {
        ...state.workout,
        exercises: state.workout.exercises.filter(
          (exercise) => exercise.id !== params.exerciseId,
        ),
      };
      const version = increment(state, request, false);
      return new HttpResponse(null, responseInit(version, 204));
    },
  ),
  http.put(
    '*/training-plans/:catalogEntryId/workouts/:workoutId/exercises/order',
    async ({ params, request }) => {
      const state = getState(getScenario(request));
      const readOnly = rejectPersonalReference(params.catalogEntryId);
      if (readOnly !== null) return readOnly;
      const invalid = validateMutation(request, state, getScenario(request));
      if (invalid !== null) return invalid;
      const input = (await request.json()) as ReorderExercisesRequest;
      const byId = new Map(
        state.workout.exercises.map((item) => [item.id, item]),
      );
      state.workout = {
        ...state.workout,
        exercises: input.exerciseIds.flatMap((id) => {
          const exercise = byId.get(id);
          return exercise === undefined ? [] : [exercise];
        }),
      };
      const version = increment(state, request, false);
      return new HttpResponse(null, responseInit(version, 204));
    },
  ),
  http.put(
    '*/training-plans/:catalogEntryId/workouts/:workoutId/exercises/:exerciseId/image',
    ({ params, request }) => personalImageMutation(params, request, false),
  ),
  http.delete(
    '*/training-plans/:catalogEntryId/workouts/:workoutId/exercises/:exerciseId/image',
    ({ params, request }) => personalImageMutation(params, request, true),
  ),
  http.post('*/training-plan-clone-jobs', async ({ request }) => {
    const state = getState(getScenario(request));
    const input = (await request.json()) as { globalTrainingPlanId: string };
    const plan = state.plans.find(
      (item) => item.id === input.globalTrainingPlanId,
    );
    if (plan === undefined)
      return apiError(
        'TRAINING_PLAN_NOT_FOUND',
        'Training plan not found.',
        404,
      );
    await delay(300);
    const now = new Date().toISOString();
    const data: PersonalTrainingPlanListItem = {
      cloneJobId: '84b000000000000000000001',
      completedImages: 0,
      createdAt: now,
      generation: 1,
      itemType: 'clone-job',
      sourceName: plan.name,
      state: 'running',
      totalImages: 1,
      updatedAt: now,
    };
    state.cloneJobs = [data];
    return HttpResponse.json({ data }, createMockResponseInit({ status: 202 }));
  }),
  http.post('*/training-plan-clone-jobs/:cloneJobId/retry', ({ request }) => {
    const state = getState(getScenario(request));
    const job = state.cloneJobs[0];
    if (job?.itemType !== 'clone-job')
      return apiError(
        'TRAINING_PLAN_CLONE_JOB_NOT_FOUND',
        'Clone job not found.',
        404,
      );
    const data = {
      ...job,
      generation: job.generation + 1,
      state: 'running' as const,
    };
    state.cloneJobs = [data];
    return HttpResponse.json({ data }, createMockResponseInit({ status: 202 }));
  }),
  http.delete('*/training-plan-clone-jobs/:cloneJobId', ({ request }) => {
    const state = getState(getScenario(request));
    const job = state.cloneJobs[0];
    if (job?.itemType !== 'clone-job')
      return apiError(
        'TRAINING_PLAN_CLONE_JOB_NOT_FOUND',
        'Clone job not found.',
        404,
      );
    const data = { ...job, state: 'cancelling' as const };
    state.cloneJobs = [data];
    return HttpResponse.json({ data }, createMockResponseInit({ status: 202 }));
  }),
];

function toPersonalPlanItem(
  plan: TrainingPlanSummary,
  catalogEntryId: string,
  source: 'global-reference' | 'owned',
  activeCatalogEntryId: string | null,
): Extract<PersonalTrainingPlanListItem, { itemType: 'training-plan' }> {
  return {
    ...plan,
    active: activeCatalogEntryId === catalogEntryId,
    catalogEntryId,
    itemType: 'training-plan',
    source,
  };
}

function rejectPersonalReference(
  catalogEntryId: string | readonly string[] | undefined,
) {
  return catalogEntryId === '74b000000000000000000002'
    ? apiError(
        'GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY',
        'Global reference is read only.',
        409,
      )
    : null;
}

function personalNestedDelete(
  catalogEntryId: string | readonly string[] | undefined,
  request: Request,
) {
  const state = getState(getScenario(request));
  const readOnly = rejectPersonalReference(catalogEntryId);
  if (readOnly !== null) return readOnly;
  const invalid = validateMutation(request, state, getScenario(request));
  if (invalid !== null) return invalid;
  const version = increment(state, request, false);
  return new HttpResponse(null, responseInit(version, 204));
}

function personalImageMutation(
  params: Record<string, string | readonly string[] | undefined>,
  request: Request,
  removing: boolean,
) {
  const state = getState(getScenario(request));
  const readOnly = rejectPersonalReference(params.catalogEntryId);
  if (readOnly !== null) return readOnly;
  const invalid = validateMutation(request, state, getScenario(request));
  if (invalid !== null) return invalid;
  const image = removing ? null : signedExerciseImage('fresh');
  state.workout = {
    ...state.workout,
    exercises: state.workout.exercises.map((exercise) =>
      exercise.id === params.exerciseId && exercise.type === 'image'
        ? { ...exercise, image }
        : exercise,
    ),
  };
  const version = increment(state, request, false);
  return removing
    ? new HttpResponse(null, responseInit(version, 204))
    : HttpResponse.json({ data: { image } }, responseInit(version));
}
