import 'dotenv/config';

import { connect, disconnect, model, Types, type Model } from 'mongoose';

import {
  PersonDocument,
  PersonSchema,
} from '~/person/repositories/person.schema';
import {
  TrainingPlanAssistantSessionDocument,
  TrainingPlanAssistantSessionSchema,
} from '~/training-plan-assistant/repositories/training-plan-assistant.schema';
import {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanActiveSchema,
  PersonalTrainingPlanCatalogDocument,
  PersonalTrainingPlanCatalogSchema,
  TrainingPlanCloneJobDocument,
  TrainingPlanCloneJobSchema,
} from '~/training-plan/repositories/personal-training-plan.schema';
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
  'personal-training-plans:catalog',
  'personal-training-plans:reference',
  'personal-training-plans:clone-job',
] as const;

const authScenarios = [
  'auth:person-admin',
  'auth:person-existing',
  'auth:person-legacy',
  'auth:person-new',
  'auth:person-theme-dark',
  'auth:person-theme-light',
] as const;

const assistantScenarios = [
  'assistant:confirm',
  'assistant:draft-invalid',
  'assistant:ready',
] as const;

function assertSeedCanRun(
  environment: string,
  mongodbUri: string,
  scenario: string | undefined,
): void {
  if (!['development', 'test'].includes(environment)) {
    throw new Error('Seeds are available only in development and test.');
  }

  const parsedMongoUrl = new URL(mongodbUri);
  if (!['127.0.0.1', 'localhost'].includes(parsedMongoUrl.hostname)) {
    throw new Error('Seeds require an explicitly local MongoDB host.');
  }

  const knownScenarios: readonly string[] = [
    ...assistantScenarios,
    ...authScenarios,
    ...trainingPlanScenarios,
  ];
  if (!knownScenarios.includes(scenario ?? '')) {
    throw new Error(`Unknown seed. Use ${knownScenarios.join(', ')}.`);
  }
}

async function seedAuthenticationScenario(
  personModel: Model<PersonDocument>,
  scenario: string | undefined,
): Promise<boolean> {
  if (scenario === 'auth:person-new') {
    await personModel.deleteMany({ googleSubject: 'google-new-001' }).exec();
    return true;
  }

  if (scenario === 'auth:person-admin') {
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
    return true;
  }

  if (scenario === 'auth:person-existing') {
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
    return true;
  }

  if (
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
    return true;
  }

  if (scenario === 'auth:person-legacy') {
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
    return true;
  }

  return false;
}

// The CLI keeps scenario selection and ownership-safe cleanup visible in one operational transaction.
// eslint-disable-next-line sonarjs/cognitive-complexity
async function main(): Promise<void> {
  const scenario = process.argv.slice(2).find((argument) => argument !== '--');
  const environment = process.env.NODE_ENV ?? 'development';
  const mongodbUri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/dall-fit';

  assertSeedCanRun(environment, mongodbUri, scenario);

  await connect(mongodbUri);

  try {
    const personModel = model(PersonDocument.name, PersonSchema);
    const trainingPlanModel = model(
      TrainingPlanDocument.name,
      TrainingPlanSchema,
    );
    const catalogModel = model(
      PersonalTrainingPlanCatalogDocument.name,
      PersonalTrainingPlanCatalogSchema,
    );
    const activeModel = model(
      PersonalTrainingPlanActiveDocument.name,
      PersonalTrainingPlanActiveSchema,
    );
    const cloneJobModel = model(
      TrainingPlanCloneJobDocument.name,
      TrainingPlanCloneJobSchema,
    );
    const assistantSessionModel = model(
      TrainingPlanAssistantSessionDocument.name,
      TrainingPlanAssistantSessionSchema,
    );

    if (!(await seedAuthenticationScenario(personModel, scenario))) {
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
      if (scenario?.startsWith('personal-training-plans:')) {
        const personId = new Types.ObjectId('64b000000000000000000003');
        const ownedEntryId = new Types.ObjectId('74b000000000000000000001');
        const referenceEntryId = new Types.ObjectId('74b000000000000000000002');
        await personModel
          .findOneAndUpdate(
            { _id: personId },
            {
              $set: {
                email: 'regular.runner@example.test',
                googleSubject: 'google-person-001',
                name: 'Regular Runner',
                photoUrl: null,
              },
              $unset: { isAdmin: 1 },
            },
            { new: true, setDefaultsOnInsert: true, upsert: true },
          )
          .exec();
        await Promise.all([
          catalogModel.deleteMany({ personId }).exec(),
          activeModel.deleteMany({ personId }).exec(),
          cloneJobModel.deleteMany({ personId }).exec(),
        ]);
        await catalogModel.create([
          {
            _id: ownedEntryId,
            globalTrainingPlanId: null,
            kind: 'owned',
            personId,
            trainingPlanId: personalPlanId,
          },
          {
            _id: referenceEntryId,
            globalTrainingPlanId: planId,
            kind: 'global-reference',
            personId,
            trainingPlanId: null,
          },
        ]);
        if (scenario === 'personal-training-plans:reference')
          await activeModel.create({
            catalogEntryId: referenceEntryId,
            personId,
          });
        if (scenario === 'personal-training-plans:clone-job')
          await cloneJobModel.create({
            _id: new Types.ObjectId('84b000000000000000000001'),
            completedImages: 0,
            deduplicationKey: `${personId.toString()}:${planId.toString()}`,
            generation: 1,
            globalTrainingPlanId: planId,
            personId,
            snapshot: {
              description: 'Plano estável para clonar.',
              name: 'Plano global de exemplo',
              sourceTrainingPlanId: planId.toString(),
              sourceVersion: 0,
              workouts: [],
            },
            sourceName: 'Plano global de exemplo',
            state: 'failed',
            totalImages: 0,
          });
      }

      if (scenario?.startsWith('assistant:')) {
        const personId = new Types.ObjectId('64b000000000000000000003');
        await personModel
          .findOneAndUpdate(
            { _id: personId },
            {
              $set: {
                email: 'assistant.runner@example.test',
                googleSubject: 'google-person-001',
                name: 'Assistant Runner',
                photoUrl: null,
              },
              $unset: { isAdmin: 1 },
            },
            { new: true, setDefaultsOnInsert: true, upsert: true },
          )
          .exec();
        await assistantSessionModel.deleteMany({ personId }).exec();
        const preview = scenario === 'assistant:confirm';
        const now = new Date();
        await assistantSessionModel.create({
          _id: new Types.ObjectId('94b000000000000000000001'),
          active: true,
          answers: {
            adult: 'yes',
            breathing: 'no',
            chestPain: 'no',
            chronic: 'no',
            cyclingTolerance: 'good',
            cardioEquipment: 'both',
            runningHabit: 'no',
            duration: '45',
            equipment: 'machines-free-weights',
            experience: 'beginner',
            fainting: 'no',
            frequency: '2',
            goal: 'general-health',
            heartCondition: 'no',
            impactTolerance: 'good',
            infrastructure: 'full-gym-all',
            interruption: 'none',
            location: 'full-gym',
            medication: 'no',
            notice: 'accepted',
            otherReason: 'no',
            pain: 'no',
            preferences: 'none',
            pregnancy: 'no',
            schedule: '2-45',
            supervision: 'no',
            tolerance: 'good',
            walkingTolerance: 'good',
          },
          catalogVersion: 'exercise-catalog.v2',
          currentQuestionKey: null,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          generatedDraft: preview
            ? {
                description: 'Prévia sintética para validar a confirmação.',
                planName: 'Plano de confirmação',
                workouts: [
                  {
                    estimatedDurationMinutes: 6,
                    exercises: [
                      {
                        bodyArea: 'quadriceps',
                        catalogKey: 'youtube-short:n4rakmCKJkg',
                        name: 'Leg press sentado',
                        repetitions: 12,
                        restSeconds: 60,
                        sets: 3,
                        type: 'youtube-short',
                        youtubeId: 'n4rakmCKJkg',
                      },
                    ],
                    name: 'Treino A',
                  },
                  {
                    estimatedDurationMinutes: 6,
                    exercises: [
                      {
                        bodyArea: 'back',
                        catalogKey: 'youtube-short:_c8NXVnlb8I',
                        name: 'Remada curvada supinada',
                        repetitions: 12,
                        restSeconds: 60,
                        sets: 3,
                        type: 'youtube-short',
                        youtubeId: '_c8NXVnlb8I',
                      },
                    ],
                    name: 'Treino B',
                  },
                ],
              }
            : null,
          invalidAttempts: {},
          knowledgeVersion: 'fitness-guidelines.v2',
          materialization: null,
          messages: [
            {
              createdAt: now,
              id: '123e4567-e89b-42d3-a456-426614174000',
              role: 'assistant',
              text: preview
                ? 'Revise a prévia antes de confirmar.'
                : 'As respostas obrigatórias foram concluídas.',
            },
          ],
          model: 'fake-v1',
          noticeVersion: 'assistant-notice.v1',
          operationKeys: {},
          personId,
          promptVersion: 'training-plan-assistant.v2',
          provider: 'fake',
          screeningOutcome: 'apto_para_fluxo_geral',
          status: preview ? 'preview' : 'ready',
          version: 0,
        });
      }
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
