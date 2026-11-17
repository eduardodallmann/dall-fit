import { Types, type Model } from 'mongoose';

import type { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';

export const workoutDuplicationSeeds = [
  'personal-training-plans:duplicate-workout',
  'personal-training-plans:duplicate-workout-limit',
  'personal-training-plans:duplicate-workout-size',
  'personal-training-plans:duplicate-workout-image-failure',
] as const;

export async function seedWorkoutDuplication(
  plans: Model<TrainingPlanDocument>,
  planId: Types.ObjectId,
  workoutId: Types.ObjectId,
  scenario: string,
): Promise<void> {
  const exercises: object[] = [
    {
      _id: new Types.ObjectId('65b000000000000000000001'),
      type: 'pause',
      restSeconds: 60,
    },
    {
      _id: new Types.ObjectId('65b000000000000000000002'),
      type: 'duration',
      name: 'Caminhada',
      bodyArea: 'cardio',
      durationMinutes: 10,
      instructions: 'Ritmo confortável.',
    },
  ];
  if (scenario.endsWith('image-failure'))
    exercises.push({
      _id: new Types.ObjectId('65b000000000000000000003'),
      type: 'image',
      name: 'Supino',
      bodyArea: 'chest',
      sets: 3,
      repetitions: 12,
      restSeconds: 60,
      image: {
        thumbnail: {
          key: 'exercise-images/local-missing-source/thumbnail.webp',
          width: 160,
          height: 160,
        },
        display: {
          key: 'exercise-images/local-missing-source/display.webp',
          width: 640,
          height: 640,
        },
      },
    });
  const workouts = [{ _id: workoutId, name: 'Treino de exemplo', exercises }];
  if (scenario.endsWith('limit'))
    workouts.push(
      ...Array.from({ length: 24 }, (_, index) => ({
        _id: new Types.ObjectId(`64b000000000000000000${102 + index}`),
        name: `Treino ${index + 2}`,
        exercises: [],
      })),
    );
  await plans
    .updateOne(
      { _id: planId },
      {
        $set: {
          name: 'Plano para duplicar treino',
          description: 'Plano sintético de duplicação.',
          version: 0,
          workouts,
        },
      },
    )
    .exec();
  if (scenario.endsWith('size')) {
    const [metrics] = await plans.aggregate<{ bytes: number }>([
      { $match: { _id: planId } },
      { $project: { bytes: { $bsonSize: '$$ROOT' } } },
    ]);
    await plans.collection.updateOne(
      { _id: planId },
      {
        $set: {
          description: 'x'.repeat(
            12 * 1024 * 1024 -
              metrics.bytes +
              Buffer.byteLength('Plano sintético de duplicação.') -
              80,
          ),
        },
      },
    );
  }
}
