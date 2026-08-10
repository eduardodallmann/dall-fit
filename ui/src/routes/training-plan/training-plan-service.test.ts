import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { resetTrainingPlanScenarioStates } from '~/mocks/handlers/training-plans';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';
import { mockServer } from '~/mocks/server';
import {
  createGlobalTrainingPlan,
  createTrainingPlanWorkout,
  deleteGlobalTrainingPlan,
  deleteTrainingPlanWorkout,
  getGlobalTrainingPlan,
  listGlobalTrainingPlans,
  updateGlobalTrainingPlan,
} from '~/routes/training-plan/training-plan-service';

const planId = '64b000000000000000000001';
const workoutId = '64b000000000000000000101';

describe('training plan service', () => {
  it('loads the typed collection and projected detail through MSW', async () => {
    const collection = await listGlobalTrainingPlans(1, 'success');
    const detail = await getGlobalTrainingPlan(planId, 'success');

    expect(collection).toMatchObject({ page: 1, pageSize: 20, total: 21 });
    expect(collection.data).toHaveLength(20);
    expect(detail.id).toBe(planId);
    expect(detail.workouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: workoutId, exerciseCount: 3 }),
      ]),
    );
    expect(detail.workouts[0]).not.toHaveProperty('exercises');
  });

  it('creates and updates plans through the shared API contracts', async () => {
    const created = await createGlobalTrainingPlan(
      { name: 'Novo plano', description: 'Nova descrição' },
      'create-success',
    );
    const updated = await updateGlobalTrainingPlan(
      planId,
      { name: 'Plano atualizado' },
      'update-success',
    );

    expect(created).toMatchObject({
      id: '64b000000000000000000099',
      name: 'Novo plano',
    });
    expect(updated).toMatchObject({ id: planId, name: 'Plano atualizado' });
  });

  it('restores stateful scenarios to their initial fixtures', async () => {
    await createGlobalTrainingPlan(
      { name: 'Plano temporário', description: 'Descrição temporária' },
      'create-success',
    );
    const changed = await listGlobalTrainingPlans(1, 'create-success');

    expect(changed.total).toBe(22);
    resetTrainingPlanScenarioStates();

    const restored = await listGlobalTrainingPlans(1, 'create-success');

    expect(restored.total).toBe(21);
  });

  it('creates and deletes a workout through its real returned id', async () => {
    const workout = await createTrainingPlanWorkout(planId, 'success');

    expect(workout).toMatchObject({
      id: '64b000000000000000000199',
      exerciseCount: 0,
    });
    await expect(
      deleteTrainingPlanWorkout(planId, workoutId, 'delete-workout-success'),
    ).resolves.toBeUndefined();
  });

  it('deletes a plan and propagates integration errors', async () => {
    await expect(
      deleteGlobalTrainingPlan(planId, 'delete-success'),
    ).resolves.toBeUndefined();
    mockServer.use(
      http.get('*/global/training-plans', () =>
        HttpResponse.json(
          createMockApiError('SERVICE_UNAVAILABLE', 'Service unavailable.'),
          createMockResponseInit({ status: 503 }),
        ),
      ),
    );
    await expect(
      listGlobalTrainingPlans(1, 'list-error'),
    ).rejects.toMatchObject({ response: { status: 503 } });
  });
});
