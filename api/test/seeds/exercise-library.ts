import { writeFile } from 'node:fs/promises';

import { Types, type Model } from 'mongoose';

import type { CopyExercisesRequest } from '@dall-fit/types';

import type { PersonDocument } from '~/person/repositories/person.schema';
import type { PersonalTrainingPlanCatalogDocument } from '~/training-plan/repositories/personal-training-plan.schema';
import type { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';

export const exerciseLibrarySeeds = [
  'exercise-library:ready',
  'exercise-library:limit',
  'exercise-library:size',
  'exercise-library:stale',
  'exercise-library:read-only',
  'exercise-library:not-found',
  'exercise-library:image-failure',
] as const;

interface SeedModels {
  personModel: Model<PersonDocument>;
  trainingPlanModel: Model<TrainingPlanDocument>;
  catalogModel: Model<PersonalTrainingPlanCatalogDocument>;
}

export async function seedExerciseLibrary(
  { personModel, trainingPlanModel, catalogModel }: SeedModels,
  scenario: string,
  seedSession: (
    personId: string,
    channel: 'native' | 'web',
    outputFile: string,
  ) => Promise<void>,
): Promise<void> {
  const personId = new Types.ObjectId('107000000000000000000010');
  const globalId = new Types.ObjectId('107000000000000000000001');
  const ownedId = new Types.ObjectId('107000000000000000000002');
  const olderId = new Types.ObjectId('107000000000000000000003');
  const catalogId = new Types.ObjectId('107000000000000000000020');
  const workoutId = new Types.ObjectId('107000000000000000000101');
  const firstId = new Types.ObjectId('107000000000000000000201');
  const secondId = new Types.ObjectId('107000000000000000000202');
  await personModel
    .findOneAndUpdate(
      { _id: personId },
      {
        $set: {
          googleSubject: 'google-fit107-fixture',
          name: 'Pessoa FIT 107',
          email: 'fit107@example.test',
          photoUrl: null,
        },
        $unset: { isAdmin: 1 },
      },
      { upsert: true, setDefaultsOnInsert: true },
    )
    .exec();
  await trainingPlanModel
    .deleteMany({ _id: { $in: [globalId, ownedId, olderId] } })
    .exec();
  await catalogModel.deleteMany({ _id: catalogId }).exec();
  const imageFailure = scenario === 'exercise-library:image-failure';
  const first = imageFailure
    ? {
        _id: firstId,
        type: 'image',
        name: 'Agachamento FIT107',
        bodyArea: 'quadriceps',
        sets: 3,
        repetitions: 12,
        restSeconds: 60,
        image: {
          thumbnail: {
            key: 'exercise-images/fit107-nonexistent/thumbnail.webp',
            width: 160,
            height: 160,
          },
          display: {
            key: 'exercise-images/fit107-nonexistent/display.webp',
            width: 800,
            height: 800,
          },
        },
      }
    : {
        _id: firstId,
        type: 'youtube-short',
        name: 'Agachamento FIT107',
        bodyArea: 'quadriceps',
        sets: 3,
        repetitions: 12,
        restSeconds: 60,
        youtubeId: 'ZA8gs8XP2bs',
      };
  await trainingPlanModel.create([
    {
      _id: globalId,
      ownerPersonId: null,
      name: 'Modelo FIT107',
      description: 'Origem fictícia da biblioteca.',
      workouts: [
        {
          _id: workoutId,
          name: 'Treino global',
          exercises: [
            first,
            {
              _id: secondId,
              type: 'duration',
              name: 'Caminhada FIT107',
              bodyArea: 'cardio',
              durationMinutes: 5,
              instructions: 'Ritmo confortável.',
            },
          ],
        },
      ],
    },
    {
      _id: olderId,
      ownerPersonId: null,
      name: 'Modelo anterior FIT107',
      description: 'Variação anterior.',
      workouts: [
        {
          _id: workoutId,
          name: 'Treino antigo',
          exercises: [
            {
              _id: firstId,
              type: 'duration',
              name: '  AGACHAMENTO   FIT107 ',
              bodyArea: 'back',
              durationMinutes: 10,
            },
          ],
        },
      ],
    },
    {
      _id: ownedId,
      ownerPersonId: personId,
      name: 'Meu plano FIT107',
      description: 'Destino fictício da cópia.',
      workouts: [
        {
          _id: workoutId,
          name: 'Treino pessoal',
          exercises:
            scenario === 'exercise-library:limit'
              ? Array.from({ length: 49 }, (_, index) => ({
                  _id: new Types.ObjectId(
                    `10700000000000000000${(300 + index).toString(16).padStart(4, '0')}`,
                  ),
                  type: 'pause',
                  restSeconds: 60,
                }))
              : [],
        },
      ],
    },
  ]);
  await trainingPlanModel.collection.updateOne(
    { _id: olderId },
    { $set: { updatedAt: new Date('2025-01-01T12:00:00Z') } },
  );
  await trainingPlanModel.collection.updateOne(
    { _id: globalId },
    {
      $set: {
        updatedAt: new Date('2026-01-01T12:00:00Z'),
        version: scenario === 'exercise-library:stale' ? 1 : 0,
      },
    },
  );
  if (scenario !== 'exercise-library:not-found')
    await catalogModel.create({
      _id: catalogId,
      personId,
      kind:
        scenario === 'exercise-library:read-only'
          ? 'global-reference'
          : 'owned',
      trainingPlanId:
        scenario === 'exercise-library:read-only' ? null : ownedId,
      globalTrainingPlanId:
        scenario === 'exercise-library:read-only' ? globalId : null,
    });
  if (scenario === 'exercise-library:size') {
    const [current] = await trainingPlanModel.aggregate<{ size: number }>([
      { $match: { _id: ownedId } },
      { $project: { size: { $bsonSize: '$$ROOT' } } },
    ]);
    if (current === undefined) throw new Error('Seed plan missing.');
    await trainingPlanModel.collection.updateOne(
      { _id: ownedId },
      {
        $set: {
          description: 'x'.repeat(
            12 * 1024 * 1024 -
              current.size -
              100 +
              'Destino fictício da cópia.'.length,
          ),
        },
      },
    );
  }
  const input: CopyExercisesRequest = {
    selections: [
      {
        groupId: 'name:agachamento fit107',
        trainingPlanId: globalId.toString(),
        workoutId: workoutId.toString(),
        exerciseId: firstId.toString(),
        version: 0,
      },
      {
        groupId: 'name:caminhada fit107',
        trainingPlanId: globalId.toString(),
        workoutId: workoutId.toString(),
        exerciseId: secondId.toString(),
        version: 0,
      },
    ],
  };
  await writeFile('/tmp/dall-fit-exercise-copy.json', JSON.stringify(input), {
    mode: 0o600,
  });
  await seedSession(
    personId.toString(),
    'native',
    '/tmp/dall-fit-exercise-library-token.txt',
  );
}
