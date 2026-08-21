import type {
  GlobalTrainingPlanCollectionResponse,
  GlobalTrainingPlanDetails,
  TrainingPlanSummary,
  TrainingPlanWorkoutDetails,
} from '@dall-fit/types';

const baseDate = new Date('2026-08-01T12:00:00.000Z');

export const trainingPlanFixtures: readonly TrainingPlanSummary[] = Array.from(
  { length: 21 },
  (_, index) => {
    const number = index + 1;
    const timestamp = new Date(
      baseDate.getTime() - index * 60_000,
    ).toISOString();
    const result: TrainingPlanSummary = {
      id: `64b0000000000000000000${String(number).padStart(2, '0')}`,
      name: number === 1 ? 'Hipertrofia iniciante' : `Plano global ${number}`,
      description:
        number === 1
          ? 'Plano global para uma rotina inicial de hipertrofia.'
          : `Descrição do plano global ${number}.`,
      version: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return result;
  },
);

export const largeTrainingPlanFixtures: readonly TrainingPlanSummary[] =
  Array.from({ length: 2021 }, (_, index) => {
    const base = trainingPlanFixtures[index % trainingPlanFixtures.length];
    if (base === undefined)
      throw new Error('Training plan fixture base is unavailable.');
    const number = index + 1;
    return {
      ...base,
      id: `large-training-plan-${number}`,
      name: `Plano global ${number}`,
    };
  });

export const trainingPlanDetailFixture: GlobalTrainingPlanDetails = {
  ...trainingPlanFixtures[0],
  workouts: [
    {
      exerciseCount: 5,
      id: '64b000000000000000000101',
      name: 'Treino A',
    },
    {
      exerciseCount: 2,
      id: '64b000000000000000000102',
      name: 'Treino B',
    },
  ],
  usage: { activePeople: 2, linkedPeople: 4 },
};

export const trainingPlanWorkoutFixture: TrainingPlanWorkoutDetails = {
  id: '64b000000000000000000101',
  name: 'Treino A',
  version: trainingPlanDetailFixture.version,
  trainingPlan: {
    id: trainingPlanDetailFixture.id,
    name: trainingPlanDetailFixture.name,
  },
  exercises: [
    {
      id: '64b000000000000000000201',
      type: 'youtube-short',
      name: 'Agachamento',
      youtubeId: 'ZA8gs8XP2bs',
      bodyArea: 'quadriceps',
      restSeconds: 60,
      sets: 3,
      repetitions: 12,
    },
    {
      id: '64b000000000000000000202',
      type: 'image',
      name: 'Supino',
      image: null,
      bodyArea: 'chest',
      restSeconds: 60,
      sets: 3,
      repetitions: 12,
    },
    {
      id: '64b000000000000000000203',
      type: 'youtube-long',
      name: 'Mobilidade',
      youtubeId: '2isq0vuKruE',
      bodyArea: 'mobility',
    },
    { id: '64b000000000000000000204', type: 'pause', restSeconds: 60 },
    {
      id: '64b000000000000000000205',
      type: 'duration',
      name: 'Corrida',
      bodyArea: 'cardio',
      durationMinutes: 15,
    },
  ],
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
};

export function trainingPlanCollectionFixture(
  plans: readonly TrainingPlanSummary[],
  page: number,
): GlobalTrainingPlanCollectionResponse {
  const pageSize = 20;
  const result = {
    data: plans.slice((page - 1) * pageSize, page * pageSize).map((plan) => ({
      ...plan,
      usage: { activePeople: 0, linkedPeople: 0 },
    })),
    page,
    pageSize,
    total: plans.length,
  };

  return result;
}
