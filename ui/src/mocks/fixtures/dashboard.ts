import type { AdminDashboard, Dashboard } from '@dall-fit/types';

const weeks = [
  ['2026-08-10', '2026-08-16', 1],
  ['2026-08-17', '2026-08-23', 2],
  ['2026-08-24', '2026-08-30', 2],
  ['2026-08-31', '2026-09-06', 3],
  ['2026-09-07', '2026-09-13', 1],
  ['2026-09-14', '2026-09-20', 3],
  ['2026-09-21', '2026-09-27', 2],
  ['2026-09-28', '2026-10-04', 2],
] as const;

export function createDashboardFixture(
  state: 'empty' | 'personal' | 'session-running' = 'personal',
): Dashboard {
  const empty = state === 'empty';
  let nextAction: Dashboard['nextAction'];
  if (empty) nextAction = { type: 'select-plan' };
  else if (state === 'session-running')
    nextAction = {
      planName: 'Plano Equilíbrio Total',
      type: 'resume-workout',
      workoutId: '64b000000000000000000102',
      workoutName: 'Costas e braços',
    };
  else
    nextAction = {
      catalogEntryId: '64b000000000000000000011',
      planName: 'Plano Equilíbrio Total',
      type: 'start-workout',
      workoutId: '64b000000000000000000101',
      workoutName: 'Força de membros superiores',
    };
  return {
    currentWeek: {
      completedWorkoutCount: empty ? 0 : 2,
      days: [
        '2026-09-28',
        '2026-09-29',
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
      ].map((date, index) => ({
        completed: !empty && (index === 0 || index === 1),
        date,
        weekday: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      })),
      endDate: '2026-10-04',
      startDate: '2026-09-28',
      workoutCount: empty ? null : 3,
    },
    generatedAt: '2026-09-29T15:00:00.000Z',
    last30Days: {
      completedWorkoutCount: empty ? 0 : 9,
      fullCompletionCount: empty ? 0 : 7,
      fullCompletionPercentage: empty ? 0 : 78,
      totalDurationSeconds: empty ? 0 : 21_600,
    },
    nextAction,
    recentWorkouts: empty
      ? []
      : Array.from({ length: 5 }, (_, index) => ({
          bodyAreas: ['chest', 'shoulder'] as const,
          completedAt: `2026-09-${String(29 - index * 3).padStart(2, '0')}T12:30:00.000Z`,
          completedExerciseCount: index === 1 ? 4 : 5,
          durationSeconds: 2400 + index * 180,
          fullCompletion: index !== 1,
          id: `64b00000000000000000030${index + 1}`,
          planName: 'Plano Equilíbrio Total',
          totalExerciseCount: 5,
          workoutName:
            index % 2 === 0 ? 'Força de membros superiores' : 'Costas e braços',
        })),
    weeklyTrend: weeks.map(([startDate, endDate, count]) => ({
      completedWorkoutCount: empty ? 0 : count,
      endDate,
      startDate,
    })),
  };
}

export function createAdminDashboardFixture(): AdminDashboard {
  return {
    generatedAt: '2026-09-29T15:00:00.000Z',
    people: {
      activePlanCount: 96,
      newLast30DaysCount: 18,
      totalCount: 142,
      trainedLast30DaysCount: 73,
    },
    plans: {
      activeSelectionCount: 96,
      globalReferenceCount: 82,
      globalTemplateCount: 8,
      ownedCount: 37,
    },
    topGlobalPlans: [
      ['Movimento Essencial para Iniciantes', 34, 29],
      ['Força e Mobilidade sem Pressa', 27, 21],
      ['Rotina Curta de Corpo Inteiro', 19, 17],
      ['Caminhada e Alongamento', 14, 11],
      ['Condicionamento Progressivo', 9, 7],
    ].map(([name, linked, active], index) => ({
      activePeopleCount: Number(active),
      id: `64b00000000000000000040${index + 1}`,
      linkedPeopleCount: Number(linked),
      name: String(name),
    })),
    training: {
      completedWorkoutCount: 318,
      fullCompletionCount: 254,
      fullCompletionPercentage: 80,
      totalDurationSeconds: 763_200,
    },
    weeklyTrend: weeks.map(([startDate, endDate, count], index) => ({
      activePeopleCount: 24 + index * 3,
      completedWorkoutCount: count * 18,
      endDate,
      startDate,
    })),
  };
}
