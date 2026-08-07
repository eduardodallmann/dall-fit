import { describe, expect, it, vi } from 'vitest';

import type { TrainingPlanEntity } from '~/training-plan/domain/training-plan.entity';
import type { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import { TrainingPlanService } from '~/training-plan/services/training-plan.service';

const trainingPlan: TrainingPlanEntity = {
  id: '507f1f77bcf86cd799439011',
  ownerPersonId: null,
  name: 'Hipertrofia iniciante',
  description: 'Plano global para iniciantes',
  workouts: [
    {
      exerciseCount: 2,
      id: '507f1f77bcf86cd799439012',
      name: 'Treino A',
    },
  ],
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z',
};

function createRepositoryMock() {
  const result = {
    create: vi.fn(),
    createWorkout: vi.fn(),
    deleteGlobal: vi.fn(),
    deleteWorkout: vi.fn(),
    findGlobalById: vi.fn(),
    listGlobal: vi.fn(),
    updateGlobal: vi.fn(),
  } satisfies Record<keyof TrainingPlanRepository, ReturnType<typeof vi.fn>>;

  return result as typeof result & TrainingPlanRepository;
}

describe('TrainingPlanService', () => {
  it('lists global plans with the fixed backend page size', async () => {
    const repository = createRepositoryMock();
    repository.listGlobal.mockResolvedValue({ data: [trainingPlan], total: 1 });
    const service = new TrainingPlanService(repository);

    const result = await service.listGlobal(2);

    expect(repository.listGlobal.mock.calls).toEqual([[2, 20]]);
    expect(result).toEqual({ data: [trainingPlan], total: 1 });
  });

  it('creates a global plan with null ownership', async () => {
    const repository = createRepositoryMock();
    repository.create.mockResolvedValue(trainingPlan);
    const service = new TrainingPlanService(repository);

    const result = await service.createGlobal({
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
  });

  it('returns a global plan detail', async () => {
    const repository = createRepositoryMock();
    repository.findGlobalById.mockResolvedValue(trainingPlan);
    const service = new TrainingPlanService(repository);

    const result = await service.getGlobal(trainingPlan.id);

    expect(result).toBe(trainingPlan);
  });

  it('rejects a missing global plan detail', async () => {
    const repository = createRepositoryMock();
    repository.findGlobalById.mockResolvedValue(null);
    const service = new TrainingPlanService(repository);

    await expect(service.getGlobal(trainingPlan.id)).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_NOT_FOUND' },
      status: 404,
    });
  });

  it('updates and returns only the public plan summary', async () => {
    const repository = createRepositoryMock();
    repository.updateGlobal.mockResolvedValue({
      ...trainingPlan,
      name: 'Plano atualizado',
    });
    const service = new TrainingPlanService(repository);

    const result = await service.updateGlobal(trainingPlan.id, {
      name: 'Plano atualizado',
    });

    expect(repository.updateGlobal.mock.calls).toEqual([
      [trainingPlan.id, { name: 'Plano atualizado' }],
    ]);
    expect(result).toEqual({
      id: trainingPlan.id,
      name: 'Plano atualizado',
      description: trainingPlan.description,
      createdAt: trainingPlan.createdAt,
      updatedAt: trainingPlan.updatedAt,
    });
    expect(result).not.toHaveProperty('ownerPersonId');
    expect(result).not.toHaveProperty('workouts');
  });

  it('rejects updating a missing global plan', async () => {
    const repository = createRepositoryMock();
    repository.updateGlobal.mockResolvedValue(null);
    const service = new TrainingPlanService(repository);

    await expect(
      service.updateGlobal(trainingPlan.id, { name: 'Plano atualizado' }),
    ).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_NOT_FOUND' },
      status: 404,
    });
  });

  it('deletes an existing global plan', async () => {
    const repository = createRepositoryMock();
    repository.deleteGlobal.mockResolvedValue(true);
    const service = new TrainingPlanService(repository);

    await service.deleteGlobal(trainingPlan.id);

    expect(repository.deleteGlobal.mock.calls).toEqual([[trainingPlan.id]]);
  });

  it('rejects deleting a missing global plan', async () => {
    const repository = createRepositoryMock();
    repository.deleteGlobal.mockResolvedValue(false);
    const service = new TrainingPlanService(repository);

    await expect(service.deleteGlobal(trainingPlan.id)).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_NOT_FOUND' },
      status: 404,
    });
  });

  it('creates a workout with the backend default name', async () => {
    const repository = createRepositoryMock();
    const workout = {
      exerciseCount: 0,
      id: '507f1f77bcf86cd799439013',
      name: 'Novo treino',
    };
    repository.createWorkout.mockResolvedValue(workout);
    const service = new TrainingPlanService(repository);

    const result = await service.createWorkout(trainingPlan.id);

    expect(repository.createWorkout.mock.calls).toEqual([
      [trainingPlan.id, 'Novo treino'],
    ]);
    expect(result).toEqual(workout);
  });

  it('rejects creating a workout for a missing plan', async () => {
    const repository = createRepositoryMock();
    repository.createWorkout.mockResolvedValue(null);
    const service = new TrainingPlanService(repository);

    await expect(service.createWorkout(trainingPlan.id)).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_NOT_FOUND' },
      status: 404,
    });
  });

  it('deletes an existing workout', async () => {
    const repository = createRepositoryMock();
    repository.deleteWorkout.mockResolvedValue('deleted');
    const service = new TrainingPlanService(repository);

    await service.deleteWorkout(trainingPlan.id, trainingPlan.workouts[0].id);

    expect(repository.deleteWorkout.mock.calls).toEqual([
      [trainingPlan.id, trainingPlan.workouts[0].id],
    ]);
  });

  it.each([
    ['training-plan-not-found', 'TRAINING_PLAN_NOT_FOUND'],
    ['workout-not-found', 'WORKOUT_NOT_FOUND'],
  ] as const)(
    'maps %s when deleting a workout',
    async (repositoryResult, code) => {
      const repository = createRepositoryMock();
      repository.deleteWorkout.mockResolvedValue(repositoryResult);
      const service = new TrainingPlanService(repository);

      await expect(
        service.deleteWorkout(trainingPlan.id, trainingPlan.workouts[0].id),
      ).rejects.toMatchObject({ response: { code }, status: 404 });
    },
  );
});
