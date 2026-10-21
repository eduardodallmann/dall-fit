import { http, HttpResponse } from 'msw/http';
import { describe, expect, it, vi } from 'vitest';

import { apiClient, UPLOAD_REQUEST_TIMEOUT } from '~/core/http/api-client';
import { isAmbiguousMutationFailure } from '~/core/http/http-error';
import { resetTrainingPlanScenarioStates } from '~/mocks/handlers/training-plans';
import {
  createMockApiError,
  createMockResponseInit,
} from '~/mocks/mock-response';
import { mockServer } from '~/mocks/server';
import {
  copyTrainingPlanExercises,
  createGlobalTrainingPlan,
  createTrainingPlanExercise,
  createTrainingPlanWorkout,
  deleteGlobalTrainingPlan,
  deleteTrainingPlanWorkout,
  getGlobalTrainingPlan,
  getTrainingPlanWorkout,
  listGlobalTrainingPlans,
  removeTrainingPlanExerciseImage,
  reorderTrainingPlanExercises,
  trainingPlanMockSearch,
  updateGlobalTrainingPlan,
  updateTrainingPlanExercise,
  uploadTrainingPlanExerciseImage,
} from '~/routes/training-plan/training-plan-service';

const planId = '64b000000000000000000001';
const workoutId = '64b000000000000000000101';

describe('training plan service', () => {
  it.each(['proxy', 'missing-version', 'known-media-error'])(
    'requires reconciliation only when the copy result is uncertain: %s',
    async (kind) => {
      mockServer.use(
        http.post(
          '*/training-plans/:catalogEntryId/workouts/:workoutId/exercises/copy',
          () => {
            if (kind === 'proxy')
              return new HttpResponse(
                'Upstream failed',
                createMockResponseInit({ status: 502 }),
              );
            if (kind === 'missing-version')
              return HttpResponse.json(
                { data: [] },
                createMockResponseInit({ status: 201 }),
              );
            return HttpResponse.json(
              createMockApiError('EXERCISE_IMAGE_COPY_FAILED', 'Copy failed'),
              createMockResponseInit({ status: 503 }),
            );
          },
        ),
      );
      const error: unknown = await copyTrainingPlanExercises(
        planId,
        workoutId,
        { selections: [] },
        0,
        'success',
      ).catch((failure: unknown) => failure);
      expect(isAmbiguousMutationFailure(error)).toBe(
        kind !== 'known-media-error',
      );
    },
  );
  it('serializes the mock selector only when API mocks are enabled', () => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'false');
    expect(trainingPlanMockSearch('success')).toEqual({});

    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    expect(trainingPlanMockSearch('success')).toEqual({
      mockTrainingPlans: 'success',
    });

    vi.unstubAllEnvs();
  });

  it('loads the typed collection and projected detail through MSW', async () => {
    const collection = await listGlobalTrainingPlans(1, 'success');
    const detail = await getGlobalTrainingPlan(planId, 'success');

    expect(collection).toMatchObject({ page: 1, pageSize: 20, total: 21 });
    expect(collection.data).toHaveLength(20);
    expect(detail.id).toBe(planId);
    expect(detail.workouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: workoutId, exerciseCount: 5 }),
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
      0,
      'update-success',
    );

    expect(created).toMatchObject({
      id: '64b000000000000000000099',
      name: 'Novo plano',
    });
    expect(updated).toMatchObject({
      id: planId,
      name: 'Plano atualizado',
      version: 1,
    });
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
    const workout = await createTrainingPlanWorkout(planId, 0, 'success');

    expect(workout.data).toMatchObject({
      id: '64b000000000000000000199',
      exerciseCount: 0,
    });
    await expect(
      deleteTrainingPlanWorkout(planId, workoutId, 1, 'success'),
    ).resolves.toBe(2);
  });

  it('deletes a plan and propagates integration errors', async () => {
    await expect(
      deleteGlobalTrainingPlan(planId, 0, 'delete-success'),
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

  it('uses resource versions across editor mutations and multipart uploads', async () => {
    const workout = await getTrainingPlanWorkout(planId, workoutId, 'success');
    expect(workout).toMatchObject({ id: workoutId, version: 0 });

    const created = await createTrainingPlanExercise(
      planId,
      workoutId,
      { type: 'image' },
      0,
      'success',
    );
    expect(created).toMatchObject({
      data: { type: 'image', image: null },
      version: 1,
    });
    const updated = await updateTrainingPlanExercise(
      planId,
      workoutId,
      created.data.id,
      { name: 'Imagem editada' },
      1,
      'success',
    );
    expect(updated).toMatchObject({
      data: { name: 'Imagem editada' },
      version: 2,
    });

    const ids = [
      ...workout.exercises.map((exercise) => exercise.id),
      created.data.id,
    ];
    await expect(
      reorderTrainingPlanExercises(
        planId,
        workoutId,
        { exerciseIds: ids },
        2,
        'success',
      ),
    ).resolves.toBe(2);
    await expect(
      removeTrainingPlanExerciseImage(
        planId,
        workoutId,
        created.data.id,
        2,
        'success',
      ),
    ).resolves.toBe(2);

    const put = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
      data: {
        data: {
          image: {
            thumbnailUrl: 'https://blob.test/thumb.webp',
            displayUrl: 'https://blob.test/display.webp',
            signedUrlExpiresAt: '2026-08-14T12:15:00.000Z',
          },
        },
      },
      headers: { 'x-resource-version': '3' },
    });
    const upload = await uploadTrainingPlanExerciseImage(
      planId,
      workoutId,
      created.data.id,
      new File(['image'], 'image.png', { type: 'image/png' }),
      2,
      'success',
    );
    expect(upload.version).toBe(3);
    expect(put.mock.calls[0]?.[1]).toBeInstanceOf(FormData);
    expect(put.mock.calls[0]?.[2]).toMatchObject({
      timeout: UPLOAD_REQUEST_TIMEOUT,
    });
    put.mockRestore();
  });

  it('rejects a successful mutation response without a resource version', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        data: {
          exerciseCount: 0,
          id: '64b000000000000000000199',
          name: 'Novo treino',
        },
      },
      headers: {},
    });

    await expect(
      createTrainingPlanWorkout(planId, 0, 'success'),
    ).rejects.toThrow('invalid resource version');
    expect(post.mock.calls[0]?.[2]).toMatchObject({
      headers: { 'X-Resource-Version': '0' },
    });
    post.mockRestore();
  });
});
