import 'dotenv/config';

import { connect, disconnect, model, Types } from 'mongoose';

import {
  PersonDocument,
  PersonSchema,
} from '~/person/repositories/person.schema';
import {
  TrainingPlanDocument,
  TrainingPlanSchema,
} from '~/training-plan/repositories/training-plan.schema';

const trainingPlanScenarios = [
  'training-plans:create',
  'training-plans:create-workout',
  'training-plans:delete',
  'training-plans:delete-workout',
  'training-plans:detail',
  'training-plans:list',
  'training-plans:not-found',
  'training-plans:update',
  'training-plans:workout-editor',
  'training-plans:workout-conflict',
  'training-plans:workout-limits',
] as const;

async function main(): Promise<void> {
  const scenario = process.argv.slice(2).find((argument) => argument !== '--');
  const environment = process.env.NODE_ENV ?? 'development';
  const mongodbUri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/dall-fit';

  if (!['development', 'test'].includes(environment)) {
    throw new Error('Seeds are available only in development and test.');
  }

  const parsedMongoUrl = new URL(mongodbUri);
  if (!['127.0.0.1', 'localhost'].includes(parsedMongoUrl.hostname)) {
    throw new Error('Seeds require an explicitly local MongoDB host.');
  }

  const authScenarios = [
    'auth:person-admin',
    'auth:person-existing',
    'auth:person-legacy',
    'auth:person-new',
    'auth:person-theme-dark',
    'auth:person-theme-light',
  ];
  if (
    !authScenarios.includes(scenario ?? '') &&
    !trainingPlanScenarios.includes(
      (scenario ?? '') as (typeof trainingPlanScenarios)[number],
    )
  ) {
    throw new Error(
      `Unknown seed. Use ${[...authScenarios, ...trainingPlanScenarios].join(', ')}.`,
    );
  }

  await connect(mongodbUri);

  try {
    const personModel = model(PersonDocument.name, PersonSchema);
    const trainingPlanModel = model(
      TrainingPlanDocument.name,
      TrainingPlanSchema,
    );

    if (scenario === 'auth:person-new') {
      await personModel.deleteMany({ googleSubject: 'google-new-001' }).exec();
    } else if (scenario === 'auth:person-admin') {
      await personModel
        .findOneAndUpdate(
          { googleSubject: 'google-admin-001' },
          {
            $set: {
              email: 'admin.runner@example.test',
              isAdmin: true,
              name: 'Admin Runner',
              photoUrl: 'https://example.test/admin-avatar.png',
            },
          },
          { new: true, setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
    } else if (scenario === 'auth:person-existing') {
      await personModel
        .findOneAndUpdate(
          { googleSubject: 'google-existing-001' },
          {
            $set: {
              email: 'taylor.fit@example.test',
              name: 'Taylor Fit',
              photoUrl: 'https://example.test/avatar.png',
            },
            $unset: { configs: 1, isAdmin: 1 },
          },
          { new: true, setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
    } else if (
      scenario === 'auth:person-theme-dark' ||
      scenario === 'auth:person-theme-light'
    ) {
      const isDark = scenario === 'auth:person-theme-dark';
      await personModel
        .findOneAndUpdate(
          {
            googleSubject: isDark
              ? 'google-theme-dark-001'
              : 'google-theme-light-001',
          },
          {
            $set: {
              configs: { theme: isDark ? 'dark' : 'light' },
              email: 'theme.runner@example.test',
              name: 'Theme Runner',
              photoUrl: null,
            },
            $unset: { isAdmin: 1 },
          },
          { new: true, setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
    } else if (scenario === 'auth:person-legacy') {
      await personModel
        .findOneAndUpdate(
          { googleSubject: 'google-legacy-001' },
          {
            $set: {
              email: 'legacy.runner@example.test',
              name: 'Legacy Runner',
              photoUrl: null,
            },
            $unset: { configs: 1, isAdmin: 1 },
          },
          { new: true, setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
    } else {
      await personModel
        .findOneAndUpdate(
          { googleSubject: 'google-admin-001' },
          {
            $set: {
              email: 'admin.runner@example.test',
              isAdmin: true,
              name: 'Admin Runner',
              photoUrl: 'https://example.test/admin-avatar.png',
            },
          },
          { new: true, setDefaultsOnInsert: true, upsert: true },
        )
        .exec();

      const planId = new Types.ObjectId('64b000000000000000000001');
      const personalPlanId = new Types.ObjectId('64b000000000000000000002');
      const workoutId = new Types.ObjectId('64b000000000000000000101');
      await trainingPlanModel
        .deleteMany({ _id: { $in: [planId, personalPlanId] } })
        .exec();
      await trainingPlanModel.create([
        {
          _id: planId,
          ownerPersonId: null,
          name: 'Plano global de exemplo',
          description:
            'Plano estável para reproduzir cenários administrativos.',
          workouts: [
            {
              _id: workoutId,
              name: 'Treino A',
              exercises: [
                {
                  _id: new Types.ObjectId('64b000000000000000000201'),
                  type: 'youtube-short',
                  name: 'Agachamento',
                  youtubeId: 'ZA8gs8XP2bs',
                  bodyArea: 'quadriceps',
                  restSeconds: 60,
                  sets: 3,
                  repetitions: 12,
                },
                {
                  _id: new Types.ObjectId('64b000000000000000000202'),
                  type: 'image',
                  name: 'Supino',
                  image: null,
                  bodyArea: 'chest',
                  restSeconds: 60,
                  sets: 3,
                  repetitions: 12,
                },
                {
                  _id: new Types.ObjectId('64b000000000000000000203'),
                  type: 'youtube-long',
                  name: 'Mobilidade',
                  youtubeId: '2isq0vuKruE',
                  bodyArea: 'mobility',
                },
                {
                  _id: new Types.ObjectId('64b000000000000000000204'),
                  type: 'pause',
                  restSeconds: 60,
                },
                {
                  _id: new Types.ObjectId('64b000000000000000000205'),
                  type: 'duration',
                  name: 'Cardio',
                  bodyArea: 'cardio',
                  durationMinutes: 15,
                },
              ],
            },
          ],
        },
        {
          _id: personalPlanId,
          ownerPersonId: new Types.ObjectId('64b000000000000000000003'),
          name: 'Plano pessoal fora do escopo',
          description: 'Não aparece nas operações globais.',
          workouts: [],
        },
      ]);
    }

    process.stdout.write(`Seed ${scenario} prepared.\n`);
  } finally {
    await disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Seed failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
