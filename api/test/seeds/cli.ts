import 'dotenv/config';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import Redis from 'ioredis';
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
import {
  OfflineTrainingTerminalReceiptDocument,
  OfflineTrainingTerminalReceiptSchema,
} from '~/training/repositories/offline-training-terminal-receipt.schema';
import {
  TrainingLoadProfileDocument,
  TrainingLoadProfileSchema,
} from '~/training/repositories/training-load-profile.schema';
import {
  WorkoutExecutionDocument,
  WorkoutExecutionSchema,
} from '~/training/repositories/workout-execution.schema';

import { exerciseLibrarySeeds, seedExerciseLibrary } from './exercise-library';
import {
  seedBusinessTerms,
  seedTermsScenario,
  termsSeedModels,
  termsSeeds,
} from './terms';
import {
  seedWorkoutDuplication,
  workoutDuplicationSeeds,
} from './workout-duplication';

const trainingPlanScenarios = [
  ...exerciseLibrarySeeds,
  ...workoutDuplicationSeeds,
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
  'auth:native-session',
] as const;

const nativePersonId = '64b000000000000000000080';
const nativeTokenFile = '/tmp/dall-fit-native-session-token.txt';
const webCookieFile = '/tmp/dall-fit-web-session-cookie.txt';
const offlineSnapshotFile = '/tmp/dall-fit-offline-training-snapshot.json';
const offlineLeasePersonId = '64b000000000000000000003';

const offlineLeaseScenarios = [
  'offline-training-lease:create',
  'offline-training-lease:invalid-body',
  'offline-training-lease:no-active-plan',
  'offline-training-lease:takeover',
  'offline-training-lease:takeover-required',
  'offline-training-lease:unchanged',
] as const;

const offlineSnapshotScenarios = [
  'offline-training-snapshot:current',
  'offline-training-snapshot:expired',
  'offline-training-snapshot:invalid',
  'offline-training-snapshot:ready',
  'offline-training-snapshot:revoked',
  'offline-training-snapshot:terms-required',
] as const;

const assistantScenarios = [
  'assistant:confirm',
  'assistant:draft-invalid',
  'assistant:ready',
] as const;

const dashboardScenarios = [
  'dashboard:admin',
  'dashboard:empty',
  'dashboard:personal',
  'dashboard:timezone',
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
    ...dashboardScenarios,
    ...offlineLeaseScenarios,
    ...offlineSnapshotScenarios,
    ...trainingPlanScenarios,
    ...termsSeeds,
  ];
  if (!knownScenarios.includes(scenario ?? '')) {
    throw new Error(`Unknown seed. Use ${knownScenarios.join(', ')}.`);
  }
}

async function seedAuthenticationScenario(
  personModel: Model<PersonDocument>,
  scenario: string | undefined,
): Promise<boolean> {
  if (scenario === 'auth:native-session') {
    await personModel
      .deleteMany({
        _id: { $ne: new Types.ObjectId(nativePersonId) },
        googleSubject: 'google-native-001',
      })
      .exec();
    await personModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(nativePersonId) },
        {
          $set: {
            email: 'native.runner@example.test',
            googleSubject: 'google-native-001',
            name: 'Native Runner',
            photoUrl: null,
          },
          $unset: { configs: 1, isAdmin: 1 },
        },
        { new: true, setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
    return true;
  }
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

async function seedSession(
  sessionPersonId: string = nativePersonId,
  channel: 'native' | 'web' = 'native',
  outputFile: string = nativeTokenFile,
): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const parsedRedisUrl = new URL(redisUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsedRedisUrl.hostname)) {
    throw new Error('Native session seed requires an explicitly local Redis.');
  }
  const secret = process.env.AUTH_SESSION_SECRET;
  if (secret === undefined || secret.length < 32) {
    throw new Error(
      'AUTH_SESSION_SECRET with at least 32 characters is required.',
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt =
    issuedAt + Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 604_800);
  const jti = randomUUID();
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsignedToken = `${encode({
    alg: 'HS256',
    kid: process.env.AUTH_SESSION_ACTIVE_KEY_ID ?? 'active-v1',
    typ: 'JWT',
  })}.${encode({
    aud:
      channel === 'native'
        ? (process.env.AUTH_NATIVE_SESSION_AUDIENCE ?? 'dall-fit-android')
        : (process.env.AUTH_SESSION_AUDIENCE ?? 'dall-fit-ui'),
    exp: expiresAt,
    iat: issuedAt,
    iss: process.env.AUTH_SESSION_ISSUER ?? 'dall-fit-api',
    jti,
    sub: sessionPersonId,
  })}`;
  const signature = createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64url');
  const token = `${unsignedToken}.${signature}`;
  const namespace = `${process.env.REDIS_NAMESPACE ?? 'dall-fit'}:local`;
  const redis = new Redis(redisUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    await redis.set(
      `${namespace}:session:${jti}`,
      JSON.stringify({
        channel,
        csrfToken: randomBytes(32).toString('base64url'),
        expiresAt,
        personId: sessionPersonId,
      }),
      'PXAT',
      expiresAt * 1000,
    );
    await writeFile(
      outputFile,
      channel === 'web' ? `dall_fit_session=${token}` : token,
      { mode: 0o600 },
    );
  } finally {
    await redis.quit();
  }
}

async function seedOfflineLeaseRedis(
  scenario: string | undefined,
): Promise<void> {
  if (
    !scenario?.startsWith('offline-training-lease:') &&
    !scenario?.startsWith('offline-training-snapshot:')
  )
    return;
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const redis = new Redis(redisUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const namespace = `${process.env.REDIS_NAMESPACE ?? 'dall-fit'}:local`;
  const key = `${namespace}:offline-training-lease:${offlineLeasePersonId}`;
  try {
    await redis.connect();
    await redis.del(key);
    if (
      scenario === 'offline-training-lease:unchanged' ||
      scenario === 'offline-training-lease:takeover' ||
      scenario === 'offline-training-lease:takeover-required' ||
      (scenario.startsWith('offline-training-snapshot:') &&
        scenario !== 'offline-training-snapshot:expired')
    ) {
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await redis.set(
        key,
        JSON.stringify({
          expiresAt: new Date(expiresAt).toISOString(),
          installationId:
            scenario === 'offline-training-snapshot:revoked'
              ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
              : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          leaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          personId: offlineLeasePersonId,
        }),
        'PXAT',
        expiresAt,
      );
    }
  } finally {
    await redis.quit();
  }
}

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item) => sortCanonicalValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortCanonicalValue(item)]),
    );
  }
  return value;
}

function offlineSnapshotRequestFixture(revision: number) {
  return {
    clientUpdatedAt: '2026-09-14T12:05:00.000Z',
    executionId: '11111111-1111-4111-8111-111111111111',
    installationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    leaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    payloadVersion: 1,
    revision,
    snapshot: {
      activeTimer: null,
      state: 'in-progress',
      plan: {
        catalogEntryId: '74b000000000000000000001',
        name: 'Plano histórico capturado',
        planId: '64b000000000000000000002',
        source: 'owned',
        workouts: [
          {
            bodyAreas: ['chest'],
            id: '64b000000000000000000101',
            name: 'Treino capturado',
          },
        ],
      },
      startedAt: '2026-09-14T12:00:00.000Z',
      workout: {
        exercises: [
          {
            bodyArea: 'chest',
            completedAt: null,
            id: '64b000000000000000000201',
            name: 'Exercício capturado',
            repetitions: 10,
            restSeconds: 60,
            series: [
              {
                completedAt: null,
                loadKg: null,
                number: 1,
                repetitions: 10,
              },
            ],
            sets: 1,
            type: 'youtube-short',
            youtubeId: 'ZA8gs8XP2bs',
          },
        ],
        id: '64b000000000000000000101',
        name: 'Treino capturado',
      },
    },
  };
}

async function seedOfflineSnapshotRedis(
  scenario: string | undefined,
): Promise<void> {
  if (!scenario?.startsWith('offline-training-snapshot:')) return;
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const redis = new Redis(redisUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const namespace = `${process.env.REDIS_NAMESPACE ?? 'dall-fit'}:local`;
  const key = `${namespace}:offline-training-snapshot:${offlineLeasePersonId}`;
  try {
    await redis.connect();
    await redis.del(key);
    if (scenario === 'offline-training-snapshot:current') {
      const request = offlineSnapshotRequestFixture(2);
      const acceptedAtMs = Date.parse('2026-09-14T12:06:00.000Z');
      const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const contentHash = createHash('sha256')
        .update(JSON.stringify(sortCanonicalValue(request)))
        .digest('hex');
      await redis.hset(key, {
        acceptedAtMs: String(acceptedAtMs),
        clientUpdatedAt: request.clientUpdatedAt,
        clientUpdatedAtMs: String(Date.parse(request.clientUpdatedAt)),
        contentHash,
        executionId: request.executionId,
        expiresAtMs: String(expiresAtMs),
        orderedAtMs: String(Date.parse(request.clientUpdatedAt)),
        payloadVersion: '1',
        revision: '2',
        snapshot: JSON.stringify(request.snapshot),
      });
      await redis.pexpireat(key, expiresAtMs);
    }
  } finally {
    await redis.quit();
  }
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
    const personModel = model<PersonDocument>(
      PersonDocument.name,
      PersonSchema,
    );
    const trainingPlanModel = model<TrainingPlanDocument>(
      TrainingPlanDocument.name,
      TrainingPlanSchema,
    );
    const catalogModel = model<PersonalTrainingPlanCatalogDocument>(
      PersonalTrainingPlanCatalogDocument.name,
      PersonalTrainingPlanCatalogSchema,
    );
    const activeModel = model<PersonalTrainingPlanActiveDocument>(
      PersonalTrainingPlanActiveDocument.name,
      PersonalTrainingPlanActiveSchema,
    );
    const cloneJobModel = model<TrainingPlanCloneJobDocument>(
      TrainingPlanCloneJobDocument.name,
      TrainingPlanCloneJobSchema,
    );
    const assistantSessionModel = model<TrainingPlanAssistantSessionDocument>(
      TrainingPlanAssistantSessionDocument.name,
      TrainingPlanAssistantSessionSchema,
    );
    const offlineTerminalReceiptModel =
      model<OfflineTrainingTerminalReceiptDocument>(
        OfflineTrainingTerminalReceiptDocument.name,
        OfflineTrainingTerminalReceiptSchema,
      );
    const trainingLoadProfileModel = model<TrainingLoadProfileDocument>(
      TrainingLoadProfileDocument.name,
      TrainingLoadProfileSchema,
    );
    const workoutExecutionModel = model<WorkoutExecutionDocument>(
      WorkoutExecutionDocument.name,
      WorkoutExecutionSchema,
    );

    if (scenario?.startsWith('terms:')) {
      await seedTermsScenario(personModel, scenario, seedSession);
    } else if (scenario?.startsWith('exercise-library:')) {
      await seedExerciseLibrary(
        { personModel, trainingPlanModel, catalogModel },
        scenario,
        seedSession,
      );
    } else if (!(await seedAuthenticationScenario(personModel, scenario))) {
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
      if (scenario?.startsWith('dashboard:')) {
        const regularPersonId = new Types.ObjectId('64b000000000000000000003');
        const regular = await personModel
          .findOneAndUpdate(
            { _id: regularPersonId },
            {
              $set: {
                email: 'dashboard.runner@example.test',
                googleSubject: 'google-dashboard-001',
                name: 'Dashboard Runner',
                photoUrl: null,
              },
              $unset: { isAdmin: 1 },
            },
            { new: true, setDefaultsOnInsert: true, upsert: true },
          )
          .orFail()
          .exec();
        const admin = await personModel
          .findOne({ googleSubject: 'google-admin-001' })
          .orFail()
          .exec();
        const people = [regular, admin];
        const personIds = people.map((person) => person._id);
        await Promise.all([
          catalogModel.deleteMany({ personId: { $in: personIds } }).exec(),
          activeModel.deleteMany({ personId: { $in: personIds } }).exec(),
          workoutExecutionModel
            .deleteMany({ personId: { $in: personIds } })
            .exec(),
        ]);
        if (scenario !== 'dashboard:empty') {
          for (const [index, person] of people.entries()) {
            const entry = await catalogModel.create({
              _id: new Types.ObjectId(
                `74b00000000000000000001${String(index + 1)}`,
              ),
              globalTrainingPlanId: planId,
              kind: 'global-reference',
              personId: person._id,
              trainingPlanId: null,
            });
            await activeModel.create({
              catalogEntryIds: [entry._id],
              personId: person._id,
            });
            await workoutExecutionModel.create({
              bodyAreas: ['quadriceps'],
              catalogEntryId: entry._id,
              completedAt: new Date(
                index === 0
                  ? '2026-09-28T03:00:00.000Z'
                  : '2026-09-29T12:00:00.000Z',
              ),
              completedExerciseCount: 5,
              durationSeconds: 2700,
              fullCompletion: true,
              personId: person._id,
              planName: 'Plano global de exemplo',
              sessionId: `dashboard-seed-${index + 1}`,
              source: 'global-reference',
              startedAt: new Date(
                index === 0
                  ? '2026-09-28T02:15:00.000Z'
                  : '2026-09-29T11:15:00.000Z',
              ),
              status: 'completed',
              timezone: 'America/Sao_Paulo',
              totalExerciseCount: 5,
              totalLoadKg: 120,
              trainingPlanId: planId,
              workoutCount: 1,
              workoutId,
              workoutName: 'Treino A',
            });
          }
        }
        await seedSession(
          scenario === 'dashboard:admin'
            ? admin._id.toString()
            : regular._id.toString(),
          'web',
          webCookieFile,
        );
      }
      if (
        scenario?.startsWith('personal-training-plans:') ||
        scenario?.startsWith('offline-training-lease:') ||
        scenario?.startsWith('offline-training-snapshot:')
      ) {
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
        if (scenario?.startsWith('personal-training-plans:duplicate-workout')) {
          await seedWorkoutDuplication(
            trainingPlanModel,
            personalPlanId,
            workoutId,
            scenario,
          );
          await seedSession(personId.toString());
        }
        if (scenario === 'personal-training-plans:reference')
          await activeModel.create({
            catalogEntryIds: [referenceEntryId],
            personId,
          });
        if (
          (scenario?.startsWith('offline-training-lease:') ||
            scenario?.startsWith('offline-training-snapshot:')) &&
          scenario !== 'offline-training-lease:no-active-plan'
        )
          await activeModel.create({
            catalogEntryIds: [ownedEntryId],
            personId,
          });
        if (scenario?.startsWith('offline-training-snapshot:')) {
          await Promise.all([
            offlineTerminalReceiptModel.deleteMany({ personId }).exec(),
            trainingLoadProfileModel.deleteMany({ personId }).exec(),
            workoutExecutionModel.deleteMany({ personId }).exec(),
          ]);
        }
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
          knowledgeVersion: 'fitness-guidelines.v3',
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

    if (scenario === 'auth:native-session') {
      await seedSession();
    }
    if (
      scenario?.startsWith('offline-training-lease:') ||
      scenario?.startsWith('offline-training-snapshot:')
    ) {
      await seedSession(offlineLeasePersonId);
      await seedSession(offlineLeasePersonId, 'web', webCookieFile);
      await seedOfflineLeaseRedis(scenario);
      await seedOfflineSnapshotRedis(scenario);
      if (scenario.startsWith('offline-training-snapshot:')) {
        const revision =
          scenario === 'offline-training-snapshot:current' ? 2 : 0;
        await writeFile(
          offlineSnapshotFile,
          JSON.stringify(offlineSnapshotRequestFixture(revision)),
          { mode: 0o600 },
        );
      }
    }
    if (
      scenario !== undefined &&
      !scenario.startsWith('auth:') &&
      !scenario.startsWith('terms:')
    ) {
      await seedBusinessTerms(personModel);
      if (scenario === 'offline-training-snapshot:terms-required') {
        await termsSeedModels().receipts.deleteMany({
          personId: offlineLeasePersonId,
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
