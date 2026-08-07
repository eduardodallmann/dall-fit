import { delay, http, HttpResponse } from 'msw';

import type {
  CreateTrainingPlanRequest,
  TrainingPlanDetails,
  TrainingPlanSummary,
  UpdateTrainingPlanRequest,
} from '@dall-fit/types';

import {
  trainingPlanCollectionFixture,
  trainingPlanDetailFixture,
  trainingPlanFixtures,
} from '~/mocks/fixtures/training-plans';

interface ScenarioState {
  detail: TrainingPlanDetails;
  plans: TrainingPlanSummary[];
}

const scenarioStates = new Map<string, ScenarioState>();

function getScenario(request: Request): string {
  const result =
    request.headers.get('x-dall-fit-mock-training-plans') ?? 'success';

  return result;
}

function getState(scenario: string): ScenarioState {
  const existing = scenarioStates.get(scenario);
  if (existing !== undefined) return existing;
  const result = {
    detail: {
      ...trainingPlanDetailFixture,
      workouts: [...trainingPlanDetailFixture.workouts],
    },
    plans: [...trainingPlanFixtures],
  };
  scenarioStates.set(scenario, result);

  return result;
}

function apiError(code: string, message: string, status: number) {
  const result = HttpResponse.json({ code, details: {}, message }, { status });

  return result;
}

function queryDelay(scenario: string): number {
  return scenario === 'loading' ? 600 : 75;
}

export const trainingPlanHandlers = [
  http.get('*/global/training-plans', async ({ request }) => {
    const scenario = getScenario(request);
    await delay(queryDelay(scenario));
    if (scenario === 'list-error') {
      return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
    }
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    const state = getState(scenario);
    const plans = scenario === 'empty' ? [] : state.plans;
    const result = HttpResponse.json(
      trainingPlanCollectionFixture(plans, page),
    );

    return result;
  }),
  http.post('*/global/training-plans', async ({ request }) => {
    const scenario = getScenario(request);
    await delay(75);
    if (scenario === 'create-error') {
      return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
    }
    const input = (await request.json()) as CreateTrainingPlanRequest;
    const now = new Date().toISOString();
    const created: TrainingPlanSummary = {
      ...input,
      id: '64b000000000000000000099',
      createdAt: now,
      updatedAt: now,
    };
    getState(scenario).plans.unshift(created);
    const result = HttpResponse.json({ data: created }, { status: 201 });

    return result;
  }),
  http.get(
    '*/global/training-plans/:trainingPlanId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(queryDelay(scenario));
      if (scenario === 'detail-error') {
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      }
      if (scenario === 'not-found') {
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      }
      const state = getState(scenario);
      const plan = state.plans.find(
        (item) => item.id === params.trainingPlanId,
      );
      if (plan === undefined) {
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      }
      const detail =
        plan.id === state.detail.id
          ? { ...state.detail, ...plan }
          : { ...plan, workouts: [] };
      const result = HttpResponse.json({ data: detail });

      return result;
    },
  ),
  http.patch(
    '*/global/training-plans/:trainingPlanId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(300);
      if (scenario === 'update-error') {
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      }
      const changes = (await request.json()) as UpdateTrainingPlanRequest;
      const state = getState(scenario);
      const index = state.plans.findIndex(
        (item) => item.id === params.trainingPlanId,
      );
      if (index === -1) {
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      }
      const updated = {
        ...state.plans[index],
        ...changes,
        updatedAt: new Date().toISOString(),
      };
      state.plans[index] = updated;
      if (state.detail.id === updated.id) {
        state.detail = { ...state.detail, ...updated };
      }
      const result = HttpResponse.json({ data: updated });

      return result;
    },
  ),
  http.delete(
    '*/global/training-plans/:trainingPlanId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(300);
      if (scenario === 'delete-error') {
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      }
      const state = getState(scenario);
      const originalLength = state.plans.length;
      state.plans = state.plans.filter(
        (item) => item.id !== params.trainingPlanId,
      );
      if (state.plans.length === originalLength) {
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      }
      const result = new HttpResponse(null, { status: 204 });

      return result;
    },
  ),
  http.post(
    '*/global/training-plans/:trainingPlanId/workouts',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(75);
      if (scenario === 'create-workout-error') {
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      }
      const state = getState(scenario);
      if (state.detail.id !== params.trainingPlanId) {
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      }
      const workout = {
        exerciseCount: 0,
        id: '64b000000000000000000199',
        name: 'Novo treino',
      };
      state.detail = {
        ...state.detail,
        workouts: [...state.detail.workouts, workout],
      };
      const result = HttpResponse.json({ data: workout }, { status: 201 });

      return result;
    },
  ),
  http.delete(
    '*/global/training-plans/:trainingPlanId/workouts/:workoutId',
    async ({ params, request }) => {
      const scenario = getScenario(request);
      await delay(300);
      if (scenario === 'delete-workout-error') {
        return apiError('SERVICE_UNAVAILABLE', 'Service unavailable.', 503);
      }
      const state = getState(scenario);
      if (state.detail.id !== params.trainingPlanId) {
        return apiError(
          'TRAINING_PLAN_NOT_FOUND',
          'Training plan not found.',
          404,
        );
      }
      const originalLength = state.detail.workouts.length;
      const workouts = state.detail.workouts.filter(
        (item) => item.id !== params.workoutId,
      );
      if (workouts.length === originalLength) {
        return apiError('WORKOUT_NOT_FOUND', 'Workout not found.', 404);
      }
      state.detail = { ...state.detail, workouts };
      const result = new HttpResponse(null, { status: 204 });

      return result;
    },
  ),
];
