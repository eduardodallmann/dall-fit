import { describe, expect, it, vi } from 'vitest';

import type { PersonalTrainingPlanService } from '~/training-plan/services/personal-training-plan.service';
import type { WorkoutExecutionRepository } from '~/training/repositories/workout-execution.repository';
import { TrainingDashboardContextService } from '~/training/services/training-dashboard-context.service';
import type { WorkoutSessionStore } from '~/training/stores/workout-session.store';

function createService({
  active = null,
  last = null,
  session = null,
}: { active?: unknown; last?: unknown; session?: unknown } = {}) {
  let activePlans: unknown[] = [];
  if (Array.isArray(active)) activePlans = active;
  else if (active !== null) activePlans = [active];
  const findLastForPlan = vi.fn().mockResolvedValue(last);
  const service = new TrainingDashboardContextService(
    {
      getActiveExecutionPlans: vi.fn().mockResolvedValue(activePlans),
    } as unknown as PersonalTrainingPlanService,
    { findLastForPlan } as unknown as WorkoutExecutionRepository,
    {
      get: vi.fn().mockResolvedValue(session),
    } as unknown as WorkoutSessionStore,
  );
  return { findLastForPlan, service };
}

describe('TrainingDashboardContextService', () => {
  it('asks for a plan when there is no active selection', async () => {
    const { service } = createService();

    await expect(service.resolve('person-a')).resolves.toEqual({
      nextAction: { type: 'select-plan' },
      workoutCount: null,
    });
  });

  it('asks the training route to choose when several plans are active', async () => {
    const { service } = createService({
      active: [{ plan: { workouts: [] } }, { plan: { workouts: [] } }],
    });

    await expect(service.resolve('person-a')).resolves.toEqual({
      nextAction: { type: 'choose-training-plan' },
      workoutCount: null,
    });
  });

  it('uses the captured session before the current active selection', async () => {
    const session = {
      plan: { name: 'Snapshot', workoutCount: 4 },
      workout: { id: 'workout-session', name: 'Sessão' },
    };
    const { findLastForPlan, service } = createService({
      active: { plan: { workouts: [] } },
      session,
    });

    await expect(service.resolve('person-a')).resolves.toEqual({
      nextAction: {
        planName: 'Snapshot',
        type: 'resume-workout',
        workoutId: 'workout-session',
        workoutName: 'Sessão',
      },
      workoutCount: 4,
    });
    expect(findLastForPlan).not.toHaveBeenCalled();
  });

  it('cycles from the last completed workout to the next one', async () => {
    const active = {
      catalogEntryId: 'catalog-a',
      plan: {
        id: 'plan-a',
        name: 'Plano A',
        workouts: [
          { id: 'workout-a', name: 'A' },
          { id: 'workout-b', name: 'B' },
        ],
      },
    };
    const { findLastForPlan, service } = createService({
      active,
      last: { workoutId: 'workout-a' },
    });

    await expect(service.resolve('person-a')).resolves.toEqual({
      nextAction: {
        catalogEntryId: 'catalog-a',
        planName: 'Plano A',
        type: 'start-workout',
        workoutId: 'workout-b',
        workoutName: 'B',
      },
      workoutCount: 2,
    });
    expect(findLastForPlan).toHaveBeenCalledWith('person-a', 'plan-a');
  });

  it('starts at the first workout when there is no history', async () => {
    const { service } = createService({
      active: {
        catalogEntryId: 'catalog-a',
        plan: {
          id: 'plan-a',
          name: 'Plano A',
          workouts: [{ id: 'workout-a', name: 'A' }],
        },
      },
    });

    expect((await service.resolve('person-a')).nextAction).toMatchObject({
      type: 'start-workout',
      workoutId: 'workout-a',
    });
  });
});
