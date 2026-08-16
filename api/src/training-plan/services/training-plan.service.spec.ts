import { describe, expect, it, vi } from 'vitest';

import type { RealtimePublisherService } from '~/realtime/realtime-publisher.service';
import type { TrainingPlanEntity } from '~/training-plan/domain/training-plan.entity';
import type { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import type { ExerciseImageService } from '~/training-plan/services/exercise-image.service';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';
import type { YoutubeReferenceService } from '~/training-plan/services/youtube-reference.service';

const trainingPlan: TrainingPlanEntity = {
  id: '507f1f77bcf86cd799439011',
  ownerPersonId: null,
  name: 'Hipertrofia iniciante',
  description: 'Plano global para iniciantes',
  version: 2,
  workouts: [
    { exerciseCount: 2, id: '507f1f77bcf86cd799439012', name: 'Treino A' },
  ],
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z',
};

function createRepositoryMock() {
  const result = Object.fromEntries(
    [
      'create',
      'createExercise',
      'createWorkout',
      'deleteExercise',
      'deleteGlobal',
      'deleteWorkout',
      'findGlobalById',
      'findWorkout',
      'inspectTarget',
      'listGlobal',
      'listReferencedImageKeys',
      'reorderExercises',
      'updateExercise',
      'updateExerciseImage',
      'updateGlobal',
      'updateWorkoutName',
    ].map((name) => [name, vi.fn()]),
  ) as Record<keyof TrainingPlanRepository, ReturnType<typeof vi.fn>>;
  return result as typeof result & TrainingPlanRepository;
}

function createService(
  repository: TrainingPlanRepository,
  realtimePublisher?: RealtimePublisherService,
) {
  const youtube = {
    normalizeAndValidate: vi.fn(),
  } as unknown as YoutubeReferenceService;
  const images = {
    deleteImages: vi.fn(),
    processAndUpload: vi.fn(),
  } as unknown as ExerciseImageService;
  const realtime =
    realtimePublisher ??
    ({
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as RealtimePublisherService);
  return new TrainingPlanService(repository, youtube, images, realtime);
}

describe('TrainingPlanService', () => {
  it('lists global plans with the fixed backend page size', async () => {
    const repository = createRepositoryMock();
    repository.listGlobal.mockResolvedValue({ data: [trainingPlan], total: 1 });
    const result = await createService(repository).listGlobal(2);
    expect(repository.listGlobal.mock.calls).toEqual([[2, 20]]);
    expect(result.total).toBe(1);
  });

  it('creates a global plan with null ownership', async () => {
    const repository = createRepositoryMock();
    const publish = vi.fn().mockResolvedValue(undefined);
    repository.create.mockResolvedValue(trainingPlan);
    const result = await createService(repository, {
      publish,
    } as unknown as RealtimePublisherService).createGlobal({
      name: trainingPlan.name,
      description: trainingPlan.description,
    });
    expect(repository.create.mock.calls).toEqual([
      [
        {
          name: trainingPlan.name,
          description: trainingPlan.description,
          ownerPersonId: null,
        },
      ],
    ]);
    expect(result).toBe(trainingPlan);
    expect(publish).toHaveBeenCalledWith({
      resource: 'global-training-plan',
      resourceId: trainingPlan.id,
      state: 'present',
      version: trainingPlan.version,
    });
  });

  it('maps a stale update to a version conflict without overwriting', async () => {
    const repository = createRepositoryMock();
    repository.updateGlobal.mockResolvedValue(null);
    repository.inspectTarget.mockResolvedValue({
      trainingPlanExists: true,
      workoutExists: true,
      exerciseExists: true,
      version: 3,
    });
    await expect(
      createService(repository).updateGlobal(trainingPlan.id, 2, {
        name: 'Atualizado',
      }),
    ).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_VERSION_CONFLICT' },
      status: 412,
    });
  });

  it('maps a missing global plan before reporting a conflict', async () => {
    const repository = createRepositoryMock();
    repository.updateGlobal.mockResolvedValue(null);
    repository.inspectTarget.mockResolvedValue({
      trainingPlanExists: false,
      workoutExists: true,
      exerciseExists: true,
    });
    await expect(
      createService(repository).updateGlobal(trainingPlan.id, 2, {
        name: 'Atualizado',
      }),
    ).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_NOT_FOUND' },
      status: 404,
    });
  });

  it('creates a default image exercise at the end with null image', async () => {
    const repository = createRepositoryMock();
    repository.inspectTarget.mockResolvedValue({
      trainingPlanExists: true,
      workoutExists: true,
      exerciseExists: true,
      version: 2,
      exerciseCount: 0,
    });
    repository.createExercise.mockResolvedValue({
      data: {
        id: '507f1f77bcf86cd799439013',
        type: 'image',
        image: null,
        name: 'Novo exercício',
        bodyArea: 'other',
        restSeconds: 60,
        sets: 3,
        repetitions: 12,
      },
      version: 3,
    });
    const result = await createService(repository).createExercise(
      trainingPlan.id,
      trainingPlan.workouts[0].id,
      2,
      'image',
    );
    expect(result.data).toMatchObject({
      type: 'image',
      image: null,
      name: 'Novo exercício',
      bodyArea: 'other',
    });
    expect(result.version).toBe(3);
  });

  it('rejects an incomplete reorder without writing', async () => {
    const repository = createRepositoryMock();
    repository.findWorkout.mockResolvedValue({
      id: trainingPlan.workouts[0].id,
      name: 'Treino A',
      version: 2,
      trainingPlan: { id: trainingPlan.id, name: trainingPlan.name },
      exercises: [
        { id: '507f1f77bcf86cd799439013', type: 'pause', restSeconds: 60 },
      ],
      createdAt: trainingPlan.createdAt,
      updatedAt: trainingPlan.updatedAt,
    });
    await expect(
      createService(repository).reorderExercises(
        trainingPlan.id,
        trainingPlan.workouts[0].id,
        2,
        [],
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_EXERCISE_ORDER' },
      status: 400,
    });
    expect(repository.reorderExercises.mock.calls).toHaveLength(0);
  });
});
