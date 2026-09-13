import type {
  TrainingExerciseExecution,
  TrainingOverview,
  TrainingPlanExecutionSummary,
  TrainingSession,
  TrainingWorkoutPreview,
  WorkoutExecutionSummary,
} from '@dall-fit/types';

export const mockTrainingIds = {
  completion: '64b000000000000000000301',
  exercises: [
    '64b000000000000000000201',
    '64b000000000000000000202',
    '64b000000000000000000203',
    '64b000000000000000000204',
    '64b000000000000000000205',
  ],
  plan: '64b000000000000000000001',
  workouts: [
    '64b000000000000000000101',
    '64b000000000000000000102',
    '64b000000000000000000103',
  ],
} as const;

export const trainingPlanExecutionFixture: TrainingPlanExecutionSummary = {
  catalogEntryId: '64b000000000000000000011',
  id: mockTrainingIds.plan,
  name: 'Plano ABC 1',
  source: 'owned',
  workoutCount: 3,
};

const offlineValidity = {
  expiresAt: '2030-01-08T00:00:00.000Z',
  validatedAt: '2030-01-01T00:00:00.000Z',
} as const;

export function createTrainingPreviewFixture(): TrainingWorkoutPreview {
  return {
    exercises: [
      {
        bodyArea: 'chest',
        id: mockTrainingIds.exercises[0],
        lastLoadsKg: [15, 15, 20],
        name: 'Supino reto',
        repetitions: 12,
        restSeconds: 60,
        sets: 3,
        type: 'youtube-short',
        youtubeId: 'dQw4w9WgXcQ',
      },
      {
        bodyArea: 'shoulder',
        id: mockTrainingIds.exercises[1],
        image: null,
        lastLoadsKg: [null, null, null],
        name: 'Elevação lateral',
        repetitions: 10,
        restSeconds: 45,
        sets: 3,
        type: 'image',
      },
      {
        bodyArea: 'cardio',
        id: mockTrainingIds.exercises[2],
        name: 'Aquecimento guiado',
        type: 'youtube-long',
        youtubeId: 'M7lc1UVf-VE',
      },
      {
        id: mockTrainingIds.exercises[3],
        restSeconds: 30,
        type: 'pause',
      },
      {
        bodyArea: 'abdomen',
        durationMinutes: 2,
        id: mockTrainingIds.exercises[4],
        name: 'Prancha',
        type: 'duration',
      },
    ],
    plan: trainingPlanExecutionFixture,
    workout: { id: mockTrainingIds.workouts[0], name: 'Treino A' },
  };
}

export function createTrainingOverviewFixture(
  inProgress = false,
): TrainingOverview {
  return {
    offlinePreparation: {
      plan: trainingPlanExecutionFixture,
      workoutIds: [...mockTrainingIds.workouts],
    },
    offlineValidity,
    plan: trainingPlanExecutionFixture,
    workouts: [
      {
        bodyAreas: ['chest', 'shoulder', 'cardio', 'abdomen'],
        id: mockTrainingIds.workouts[0],
        indicator: inProgress ? 'in-progress' : 'current',
        media: { type: 'youtube-short', youtubeId: 'dQw4w9WgXcQ' },
        name: 'Treino A',
      },
      {
        bodyAreas: ['back', 'biceps'],
        id: mockTrainingIds.workouts[1],
        indicator: null,
        media: null,
        name: 'Treino B',
      },
      {
        bodyAreas: ['quadriceps', 'glutes'],
        id: mockTrainingIds.workouts[2],
        indicator: null,
        media: null,
        name: 'Treino C',
      },
    ],
  };
}

export function createTrainingSessionFixture(
  scenario: string,
  now = new Date(),
): TrainingSession {
  const exercises = createTrainingPreviewFixture().exercises.map(
    (exercise): TrainingExerciseExecution => {
      if (exercise.type === 'image' || exercise.type === 'youtube-short') {
        const { lastLoadsKg, ...base } = exercise;
        return {
          ...base,
          completedAt: null,
          series: Array.from({ length: exercise.sets }, (_, index) => ({
            completedAt: null,
            loadKg: lastLoadsKg[index] ?? null,
            number: index + 1,
            repetitions: exercise.repetitions,
          })),
        };
      }
      return { ...exercise, completedAt: null };
    },
  );
  if (scenario === 'exercise-completed' || scenario === 'workout-complete')
    completeFirstExercise(exercises, now);
  if (scenario === 'workout-complete') completeAllExercises(exercises, now);
  const activeTimer = fixtureTimer(scenario, now);
  return {
    activeTimer,
    exercises,
    expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    id: '00000000-0000-4000-8000-000000000070',
    plan: trainingPlanExecutionFixture,
    serverNow: now.toISOString(),
    startedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
    version: 0,
    workout: { id: mockTrainingIds.workouts[0], name: 'Treino A' },
  };
}

function completeFirstExercise(
  exercises: TrainingExerciseExecution[],
  now: Date,
): void {
  const first = exercises[0];
  if (first?.type !== 'youtube-short') return;
  exercises[0] = {
    ...first,
    completedAt: now.toISOString(),
    series: first.series.map((series) => ({
      ...series,
      completedAt: now.toISOString(),
    })),
  };
}

function completeAllExercises(
  exercises: TrainingExerciseExecution[],
  now: Date,
): void {
  for (const [index, exercise] of exercises.entries()) {
    exercises[index] = {
      ...exercise,
      completedAt: now.toISOString(),
      ...('series' in exercise
        ? {
            series: exercise.series.map((series) => ({
              ...series,
              completedAt: now.toISOString(),
            })),
          }
        : {}),
    };
  }
}

function fixtureTimer(
  scenario: string,
  now: Date,
): TrainingSession['activeTimer'] {
  if (scenario !== 'pause-running' && scenario !== 'duration-running')
    return null;
  const pause = scenario === 'pause-running';
  const duration = pause ? 30 : 120;
  return {
    endsAt: new Date(now.getTime() + duration * 1000).toISOString(),
    exerciseId: pause
      ? mockTrainingIds.exercises[3]
      : mockTrainingIds.exercises[4],
    kind: pause ? 'pause' : 'duration',
    startedAt: now.toISOString(),
  };
}

export function createWorkoutCompletionFixture(
  now = new Date(),
): WorkoutExecutionSummary {
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return {
    bodyAreas: ['chest', 'shoulder', 'cardio', 'abdomen'],
    completedAt: now.toISOString(),
    completedExerciseCount: 5,
    createdAt: now.toISOString(),
    durationSeconds: 3060,
    fullCompletion: true,
    id: mockTrainingIds.completion,
    planName: trainingPlanExecutionFixture.name,
    totalExerciseCount: 5,
    totalLoadKg: 53,
    trainingPlanId: mockTrainingIds.plan,
    updatedAt: now.toISOString(),
    week: {
      completedWorkoutCount: 2,
      days: Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return {
          completed: index < 2,
          date: date.toISOString().slice(0, 10),
          weekday: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        };
      }),
      workoutCount: 3,
    },
    workoutId: mockTrainingIds.workouts[0],
    workoutName: 'Treino A',
  };
}
