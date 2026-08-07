import type {
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetails,
  TrainingPlanSummary,
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
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return result;
  },
);

export const trainingPlanDetailFixture: TrainingPlanDetails = {
  ...trainingPlanFixtures[0],
  workouts: [
    {
      exerciseCount: 3,
      id: '64b000000000000000000101',
      name: 'Treino A',
    },
    {
      exerciseCount: 2,
      id: '64b000000000000000000102',
      name: 'Treino B',
    },
  ],
};

export function trainingPlanCollectionFixture(
  plans: readonly TrainingPlanSummary[],
  page: number,
): GlobalTrainingPlanCollectionResponse {
  const pageSize = 20;
  const result = {
    data: plans.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: plans.length,
  };

  return result;
}
