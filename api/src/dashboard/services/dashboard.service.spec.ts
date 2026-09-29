import { describe, expect, it, vi } from 'vitest';

import type { DashboardReadRepository } from '~/dashboard/repositories/dashboard-read.repository';
import { DashboardService } from '~/dashboard/services/dashboard.service';
import type { TrainingClockService } from '~/training/services/training-clock.service';
import type { TrainingDashboardContextService } from '~/training/services/training-dashboard-context.service';

const now = new Date('2026-09-30T02:00:00.000Z');

function createService(repository: Partial<DashboardReadRepository>) {
  const trainingContext = {
    resolve: vi.fn().mockResolvedValue({
      nextAction: { type: 'select-plan' },
      workoutCount: null,
    }),
  };
  const service = new DashboardService(
    repository as DashboardReadRepository,
    trainingContext as unknown as TrainingDashboardContextService,
    { now: vi.fn(() => now) } as unknown as TrainingClockService,
  );
  return { service, trainingContext };
}

describe('DashboardService', () => {
  it('composes the personal periods, rounded metrics and recent executions', async () => {
    const readPersonal = vi.fn().mockResolvedValue({
      days: [
        { completedWorkoutCount: 2, date: '2026-09-28' },
        { completedWorkoutCount: 1, date: '2026-08-10' },
      ],
      last30Days: {
        completedWorkoutCount: 3,
        fullCompletionCount: 2,
        totalDurationSeconds: 5400,
      },
      recentWorkouts: [
        {
          bodyAreas: ['chest'],
          completedAt: new Date('2026-09-28T12:00:00.000Z'),
          completedExerciseCount: 2,
          durationSeconds: 1800,
          fullCompletion: true,
          id: 'execution-a',
          planName: 'Plano',
          totalExerciseCount: 2,
          workoutName: 'Treino',
        },
      ],
    });
    const { service } = createService({ readPersonal });

    const result = await service.personal('person-a', 'America/Sao_Paulo');

    expect(result.generatedAt).toBe(now.toISOString());
    expect(result.currentWeek).toMatchObject({
      completedWorkoutCount: 2,
      startDate: '2026-09-28',
      endDate: '2026-10-04',
    });
    expect(result.currentWeek.days).toHaveLength(7);
    expect(result.currentWeek.days[0]).toMatchObject({
      completed: true,
      date: '2026-09-28',
      weekday: 1,
    });
    expect(result.last30Days.fullCompletionPercentage).toBe(67);
    expect(result.weeklyTrend).toHaveLength(8);
    expect(result.weeklyTrend[0]).toMatchObject({
      completedWorkoutCount: 1,
      startDate: '2026-08-10',
    });
    expect(result.recentWorkouts[0]?.completedAt).toBe(
      '2026-09-28T12:00:00.000Z',
    );
    expect(readPersonal).toHaveBeenCalledWith(
      'person-a',
      expect.objectContaining({ timezone: 'America/Sao_Paulo' }),
    );
  });

  it('uses zero percentages for empty personal and administrative metrics', async () => {
    const { service } = createService({
      readAdmin: vi.fn().mockResolvedValue({
        days: [],
        last30Days: {
          completedWorkoutCount: 0,
          fullCompletionCount: 0,
          personIds: [],
          totalDurationSeconds: 0,
        },
        people: {
          activePlanCount: 0,
          newLast30DaysCount: 0,
          totalCount: 0,
        },
        plans: {
          activeSelectionCount: 0,
          globalReferenceCount: 0,
          globalTemplateCount: 0,
          ownedCount: 0,
        },
        topGlobalPlans: [],
      }),
      readPersonal: vi.fn().mockResolvedValue({
        days: [],
        last30Days: {
          completedWorkoutCount: 0,
          fullCompletionCount: 0,
          totalDurationSeconds: 0,
        },
        recentWorkouts: [],
      }),
    });

    expect(
      (await service.personal('person-a', 'UTC')).last30Days,
    ).toMatchObject({ fullCompletionPercentage: 0 });
    const admin = await service.admin('UTC');
    expect(admin.training.fullCompletionPercentage).toBe(0);
    expect(admin.people.trainedLast30DaysCount).toBe(0);
    expect(admin.weeklyTrend).toHaveLength(8);
  });

  it('deduplicates active people independently in each admin week', async () => {
    const { service } = createService({
      readAdmin: vi.fn().mockResolvedValue({
        days: [
          {
            completedWorkoutCount: 2,
            date: '2026-09-28',
            personIds: ['person-a', 'person-b'],
          },
          {
            completedWorkoutCount: 1,
            date: '2026-09-29',
            personIds: ['person-a'],
          },
        ],
        last30Days: {
          completedWorkoutCount: 3,
          fullCompletionCount: 1,
          personIds: ['person-a', 'person-b'],
          totalDurationSeconds: 3000,
        },
        people: {
          activePlanCount: 1,
          newLast30DaysCount: 1,
          totalCount: 2,
        },
        plans: {
          activeSelectionCount: 1,
          globalReferenceCount: 1,
          globalTemplateCount: 1,
          ownedCount: 0,
        },
        topGlobalPlans: [],
      }),
    });

    const result = await service.admin('UTC');

    expect(result.people.trainedLast30DaysCount).toBe(2);
    expect(result.training.fullCompletionPercentage).toBe(33);
    expect(result.weeklyTrend.at(-1)).toMatchObject({
      activePeopleCount: 2,
      completedWorkoutCount: 3,
    });
  });

  it('maps an unknown timezone to the stable API error', async () => {
    const { service } = createService({});

    await expect(
      service.personal('person-a', 'Unknown/Zone'),
    ).rejects.toMatchObject({ status: 400 });
  });
});
