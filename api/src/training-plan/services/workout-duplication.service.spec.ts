import { describe, expect, it, vi } from 'vitest';

import type {
  NewWorkout,
  TargetState,
  WorkoutAggregate,
} from '~/training-plan/domain/training-plan.entity';
import type { TrainingPlanRepository } from '~/training-plan/repositories/training-plan.repository';
import { WorkoutDuplicationService } from '~/training-plan/services/workout-duplication.service';

const target = {
  personId: 'person',
  trainingPlanId: 'plan',
  workoutId: 'source',
  version: 3,
};
const source: WorkoutAggregate = {
  id: 'source',
  name: 'A'.repeat(120),
  version: 3,
  trainingPlan: { id: 'plan', name: 'Plano' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  exercises: [
    { id: 'pause', type: 'pause', restSeconds: 90 },
    {
      id: 'duration',
      type: 'duration',
      name: 'Caminhar',
      bodyArea: 'cardio',
      durationMinutes: 10,
      instructions: 'Ritmo leve.',
      youtubeId: 'ZA8gs8XP2bs',
    },
  ],
};
function setup(state: Partial<TargetState> = {}) {
  const plans = {
    inspectTarget: vi.fn().mockResolvedValue({
      trainingPlanExists: true,
      workoutExists: true,
      version: 3,
      workoutCount: 1,
      bsonSize: 1000,
      ...state,
    }),
    findWorkout: vi.fn().mockResolvedValue(source),
    appendWorkout: vi.fn().mockResolvedValue(true),
  };
  const service = new WorkoutDuplicationService(
    plans as unknown as TrainingPlanRepository,
  );
  return { plans, service };
}

describe('WorkoutDuplicationService', () => {
  it('preserves exercise order and fields with new identities and a bounded copy name', async () => {
    const { service } = setup();
    const result = await service.prepare(target);
    expect(result.name).toHaveLength(120);
    expect(result.name).toMatch(/ \(cópia\)$/);
    expect(result.id).toMatch(/^[a-f0-9]{24}$/);
    expect(result.createdAt).not.toBe(source.createdAt);
    expect(
      new Set([result.id, ...result.exercises.map((item) => item.id)]).size,
    ).toBe(3);
    expect(result.exercises.map((item) => ({ ...item, id: '' }))).toEqual(
      source.exercises.map((item) => ({ ...item, id: '' })),
    );
    expect(result.exercises.map((item) => item.id)).not.toEqual(
      source.exercises.map((item) => item.id),
    );
    expect(source.name).toHaveLength(120);
  });

  it.each([
    [{ trainingPlanExists: false }, 'TRAINING_PLAN_NOT_FOUND'],
    [{ workoutExists: false }, 'WORKOUT_NOT_FOUND'],
    [{ version: 4 }, 'TRAINING_PLAN_VERSION_CONFLICT'],
    [{ workoutCount: 25 }, 'WORKOUT_LIMIT_REACHED'],
    [{ bsonSize: 12 * 1024 * 1024 }, 'TRAINING_PLAN_SIZE_LIMIT_REACHED'],
  ] as const)(
    'rejects invalid source state before preparing media: %s',
    async (state, code) => {
      const { service, plans } = setup(state);
      await expect(service.prepare(target)).rejects.toMatchObject({
        response: { code },
      });
      expect(plans.findWorkout).not.toHaveBeenCalled();
      expect(plans.appendWorkout).not.toHaveBeenCalled();
    },
  );

  it('rejects a source edited between validation and capture', async () => {
    const { service, plans } = setup();
    plans.findWorkout.mockResolvedValue({ ...source, version: 4 });
    await expect(service.prepare(target)).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_VERSION_CONFLICT' },
    });
  });

  it('commits one prepared workout and diagnoses a rejected capacity guard', async () => {
    const { service, plans } = setup();
    const prepared: NewWorkout = { ...source, id: 'new' };
    expect(await service.commit(target, prepared)).toEqual({
      data: { id: 'new', name: source.name, exerciseCount: 2 },
      version: 4,
    });
    expect(plans.appendWorkout).toHaveBeenCalledWith(
      'plan',
      'source',
      3,
      prepared,
      { ownerPersonId: 'person' },
    );
    plans.appendWorkout.mockResolvedValue(false);
    await expect(service.commit(target, prepared)).rejects.toMatchObject({
      response: { code: 'TRAINING_PLAN_SIZE_LIMIT_REACHED' },
    });
  });
});
