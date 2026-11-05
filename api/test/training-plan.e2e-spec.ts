import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { RedisMemoryServer } from 'redis-memory-server';
import sharp from 'sharp';
import request, { type Test as SupertestTest } from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  CopyExercisesResponse,
  ExerciseLibraryResponse,
  GlobalTrainingPlanCollectionResponse,
  GlobalTrainingPlanLibraryResponse,
  TrainingOverviewResponse,
  TrainingPlanAssistantSessionResponse,
  TrainingPlanDetailsResponse,
} from '@dall-fit/types';

import { configureApplication } from '~/configure-application';
import { PersonDocument } from '~/person/repositories/person.schema';
import {
  TrainingPlanAssistantReceiptDocument,
  TrainingPlanAssistantSessionDocument,
} from '~/training-plan-assistant/repositories/training-plan-assistant.schema';
import { TrainingPlanCloneStarter } from '~/training-plan/adapters/training-plan-clone-starter';
import { ExerciseLibraryRepository } from '~/training-plan/repositories/exercise-library.repository';
import {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanCatalogDocument,
  TrainingPlanCloneJobDocument,
} from '~/training-plan/repositories/personal-training-plan.schema';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';
import { BlobStorageService } from '~/training-plan/services/blob-storage.service';
import { YoutubeReferenceService } from '~/training-plan/services/youtube-reference.service';
import { TrainingLoadProfileDocument } from '~/training/repositories/training-load-profile.schema';
import { WorkoutExecutionDocument } from '~/training/repositories/workout-execution.schema';

import { resetTermsFixture, seedAcceptedTerms } from './helpers/terms-fixture';

const googleCredential = Buffer.from(
  JSON.stringify({
    web: {
      client_id: 'fake-client.apps.googleusercontent.com',
      client_secret: 'fake-client-secret',
      redirect_uris: ['http://localhost:4000/callback'],
    },
  }),
).toString('base64');
const testBypassKey = 'e2e-training-test-key-with-at-least-32-random-bytes';
const neutralProfessionalFollowUpPrompt =
  'Existe alguma situação que exija acompanhamento profissional para você começar a se exercitar, como gestação, pós-parto ou outra condição específica?';

describe('Global training plans (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryServer;
  let activeModel: Model<PersonalTrainingPlanActiveDocument>;
  let catalogModel: Model<PersonalTrainingPlanCatalogDocument>;
  let cloneJobModel: Model<TrainingPlanCloneJobDocument>;
  let personModel: Model<PersonDocument>;
  let loadProfileModel: Model<TrainingLoadProfileDocument>;
  let redisClient: Redis;
  let redisServer: RedisMemoryServer;
  let trainingPlanModel: Model<TrainingPlanDocument>;
  let workoutExecutionModel: Model<WorkoutExecutionDocument>;
  let assistantSessionModel: Model<TrainingPlanAssistantSessionDocument>;
  let assistantReceiptModel: Model<TrainingPlanAssistantReceiptDocument>;
  const uploadedBlobs: Array<{ content: Buffer; key: string }> = [];
  const deletedBlobKeys: string[][] = [];
  const blobStorage = {
    copyVariant: vi.fn((source: string, destination: string) =>
      Promise.resolve({ key: destination, etag: `copied:${source}` }),
    ),
    createSignedReadUrl: vi.fn((pathname: string, validUntil: number) =>
      Promise.resolve(
        `https://8u9fq5re0oenmrtc.private.blob.vercel-storage.com/${pathname}?vercel-blob-delegation=fake&vercel-blob-signature=${validUntil}`,
      ),
    ),
    delete: vi.fn((keys: readonly string[]): Promise<void> => {
      deletedBlobKeys.push([...keys]);
      return Promise.resolve();
    }),
    getMetadata: vi.fn((pathname: string) =>
      Promise.resolve({ etag: `etag:${pathname}` }),
    ),
    listExerciseKeys: vi.fn((): Promise<readonly string[]> =>
      Promise.resolve([]),
    ),
    upload: vi.fn((pathname: string, content: Buffer) => {
      const key = pathname;
      uploadedBlobs.push({ content, key });
      return Promise.resolve({ etag: `etag:${key}`, key });
    }),
  };
  const youtubeReference = {
    normalizeAndValidate: vi.fn(() => Promise.resolve('ZA8gs8XP2bs')),
  };
  const cloneStarter = { start: vi.fn(() => Promise.resolve()) };
  const csrfTokens = new WeakMap<ReturnType<typeof request.agent>, string>();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '8.0.12' },
    });
    redisServer = new RedisMemoryServer({ binary: { version: '8.8.1' } });
    await redisServer.start();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoServer.getUri('dall-fit-training-plan-e2e');
    process.env.REDIS_URL = `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`;
    process.env.REDIS_NAMESPACE = 'dall-fit-training-e2e';
    process.env.GOOGLE_OAUTH_CREDENTIALS_BASE64 = googleCredential;
    process.env.ANDROID_MIN_VERSION_CODE = '1';
    process.env.ANDROID_PLAY_STORE_URL =
      'https://play.google.com/store/apps/details?id=com.dallfit.app';
    process.env.AUTH_SESSION_SECRET = 'e2e-session-secret-with-32-characters';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_TEST_BYPASS_ENABLED = 'true';
    process.env.AUTH_TEST_BYPASS_E2E_ENABLED = 'true';
    process.env.AUTH_TEST_BYPASS_KEY = testBypassKey;
    process.env.UI_URL = 'http://localhost:3000';
    process.env.TRAINING_PLAN_ASSISTANT_ENABLED = 'true';
    process.env.TRAINING_PLAN_ASSISTANT_PROVIDER = 'fake';

    const { AppModule } = await import('~/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BlobStorageService)
      .useValue(blobStorage)
      .overrideProvider(YoutubeReferenceService)
      .useValue(youtubeReference)
      .overrideProvider(TrainingPlanCloneStarter)
      .useValue(cloneStarter)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    personModel = app.get<Model<PersonDocument>>(
      getModelToken(PersonDocument.name),
    );
    activeModel = app.get<Model<PersonalTrainingPlanActiveDocument>>(
      getModelToken(PersonalTrainingPlanActiveDocument.name),
    );
    catalogModel = app.get<Model<PersonalTrainingPlanCatalogDocument>>(
      getModelToken(PersonalTrainingPlanCatalogDocument.name),
    );
    cloneJobModel = app.get<Model<TrainingPlanCloneJobDocument>>(
      getModelToken(TrainingPlanCloneJobDocument.name),
    );
    trainingPlanModel = app.get<Model<TrainingPlanDocument>>(
      getModelToken(TrainingPlanDocument.name),
    );
    loadProfileModel = app.get<Model<TrainingLoadProfileDocument>>(
      getModelToken(TrainingLoadProfileDocument.name),
    );
    workoutExecutionModel = app.get<Model<WorkoutExecutionDocument>>(
      getModelToken(WorkoutExecutionDocument.name),
    );
    assistantSessionModel = app.get<
      Model<TrainingPlanAssistantSessionDocument>
    >(getModelToken(TrainingPlanAssistantSessionDocument.name));
    assistantReceiptModel = app.get<
      Model<TrainingPlanAssistantReceiptDocument>
    >(getModelToken(TrainingPlanAssistantReceiptDocument.name));
    await Promise.all([
      personModel.syncIndexes(),
      trainingPlanModel.syncIndexes(),
      activeModel.syncIndexes(),
      catalogModel.syncIndexes(),
      cloneJobModel.syncIndexes(),
      loadProfileModel.syncIndexes(),
      workoutExecutionModel.syncIndexes(),
      assistantSessionModel.syncIndexes(),
      assistantReceiptModel.syncIndexes(),
    ]);
    redisClient = new Redis(process.env.REDIS_URL);
  });

  beforeEach(async () => {
    await resetTermsFixture(app);
    uploadedBlobs.length = 0;
    deletedBlobKeys.length = 0;
    vi.clearAllMocks();
    await Promise.all([
      personModel.deleteMany({}).exec(),
      trainingPlanModel.deleteMany({}).exec(),
      activeModel.deleteMany({}).exec(),
      catalogModel.deleteMany({}).exec(),
      cloneJobModel.deleteMany({}).exec(),
      loadProfileModel.deleteMany({}).exec(),
      workoutExecutionModel.deleteMany({}).exec(),
      assistantSessionModel.deleteMany({}).exec(),
      assistantReceiptModel.deleteMany({}).exec(),
      redisClient.flushdb(),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await redisClient?.quit();
    await redisServer?.stop();
    await mongoServer?.stop();
  });

  async function login(
    isAdmin: boolean,
  ): Promise<ReturnType<typeof request.agent>> {
    const googleSubject = isAdmin ? 'google-admin-001' : 'google-person-001';
    const person = await personModel.create({
      googleSubject,
      name: isAdmin ? 'Admin Runner' : 'Regular Runner',
      email: isAdmin
        ? 'admin.runner@example.test'
        : 'regular.runner@example.test',
      photoUrl: null,
      ...(isAdmin ? { isAdmin: true } : {}),
    });
    await seedAcceptedTerms(app, person._id.toString());
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject,
        name: 'Ignored profile',
        email: 'ignored@example.test',
        photoUrl: null,
      })
      .expect(204);
    const csrfResponse = await agent.get('/auth/csrf').expect(200);
    const csrfBody = csrfResponse.body as { data: { token: string } };
    csrfTokens.set(agent, csrfBody.data.token);

    return agent;
  }

  function authenticatedMutation(
    agent: ReturnType<typeof request.agent>,
    test: SupertestTest,
  ): SupertestTest {
    const csrfToken = csrfTokens.get(agent);
    if (csrfToken === undefined) {
      throw new Error('Authenticated agent is missing its CSRF token.');
    }
    const result = test
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', csrfToken);

    return result;
  }

  function withResourceVersion(
    test: SupertestTest,
    _trainingPlanId: string,
    version: number,
  ): SupertestTest {
    const result = test.set('X-Resource-Version', String(version));
    return result;
  }

  async function createGlobalPlan(
    overrides: Partial<TrainingPlanDocument> = {},
  ) {
    const result = await trainingPlanModel.create({
      ownerPersonId: null,
      name: 'Plano força',
      description: 'Treino global para força.',
      workouts: [],
      ...overrides,
    });

    return result;
  }

  async function libraryDestination() {
    const agent = await login(false);
    const created = await authenticatedMutation(
      agent,
      agent.post('/training-plans'),
    )
      .send({ name: 'Plano pessoal', description: 'Destino da cópia.' })
      .expect(201);
    const entry = (
      created.body as { data: { catalogEntryId: string; id: string } }
    ).data;
    const workout = await authenticatedMutation(
      agent,
      agent
        .post(`/training-plans/${entry.catalogEntryId}/workouts`)
        .set('X-Resource-Version', '0'),
    )
      .send({})
      .expect(201);
    const workoutId = (workout.body as { data: { id: string } }).data.id;
    return {
      agent,
      entry,
      workoutId,
      path: `/training-plans/${entry.catalogEntryId}/workouts/${workoutId}`,
    };
  }

  async function librarySource() {
    const workoutId = new Types.ObjectId();
    return createGlobalPlan({
      workouts: [
        {
          _id: workoutId,
          name: 'Origem',
          exercises: [
            {
              _id: new Types.ObjectId(),
              type: 'duration',
              name: 'Elevação lateral',
              bodyArea: 'shoulder',
              durationMinutes: 5,
              instructions: 'Movimento controlado.',
              youtubeId: 'ZA8gs8XP2bs',
            },
            { _id: new Types.ObjectId(), type: 'pause', restSeconds: 45 },
            {
              _id: new Types.ObjectId(),
              type: 'image',
              name: 'Supino',
              bodyArea: 'chest',
              sets: 3,
              repetitions: 12,
              restSeconds: 60,
              image: {
                thumbnail: {
                  key: 'exercise-images/source/thumbnail.webp',
                  width: 160,
                  height: 160,
                },
                display: {
                  key: 'exercise-images/source/display.webp',
                  width: 800,
                  height: 800,
                },
              },
            },
          ],
        },
      ],
    });
  }

  it('FIT-107 groups by normalized name, chooses the newest plan and filters its representative before pagination', async () => {
    const { agent } = await libraryDestination();
    const old = await librarySource();
    const newer = await createGlobalPlan({
      workouts: [
        {
          _id: new Types.ObjectId(),
          name: 'Outro',
          exercises: [
            {
              _id: new Types.ObjectId(),
              type: 'duration',
              name: '  ELEVACAO   LATERAL ',
              bodyArea: 'back',
              durationMinutes: 10,
            },
          ],
        },
      ],
    });
    await trainingPlanModel.collection.updateOne(
      { _id: old._id },
      { $set: { updatedAt: new Date('2025-01-01') } },
    );
    await trainingPlanModel.collection.updateOne(
      { _id: newer._id },
      { $set: { updatedAt: new Date('2026-01-01') } },
    );
    const all = await agent.get('/training-plans/exercise-library').expect(200);
    expect(all.headers['cache-control']).toBe('private, no-store');
    const rows = (all.body as ExerciseLibraryResponse).data;
    expect(rows).toHaveLength(3);
    expect(
      rows.find((row) => row.groupId === 'name:elevacao lateral'),
    ).toMatchObject({
      trainingPlanId: newer.id,
      exercise: { bodyArea: 'back', durationMinutes: 10 },
    });
    const filtered = await agent
      .get('/training-plans/exercise-library?search=elevação&bodyArea=shoulder')
      .expect(200);
    expect((filtered.body as ExerciseLibraryResponse).total).toBe(0);
    const matching = await agent
      .get('/training-plans/exercise-library?search=elevação&bodyArea=back')
      .expect(200);
    expect((matching.body as ExerciseLibraryResponse).total).toBe(1);
    await agent
      .get('/training-plans/exercise-library?bodyArea=invalid')
      .expect(400);
    await agent
      .get('/training-plans/exercise-library?bodyArea=back&bodyArea=chest')
      .expect(400);
    await request(app.getHttpServer())
      .get('/training-plans/exercise-library')
      .expect(401);
  });

  it('FIT-107 copies a complete mixed batch in one CAS with independent images and optional duration fields', async () => {
    const { agent, path } = await libraryDestination();
    const source = await librarySource();
    const library = await agent
      .get('/training-plans/exercise-library')
      .expect(200);
    const selections = [...(library.body as ExerciseLibraryResponse).data]
      .reverse()
      .map(({ exercise: _exercise, ...item }) => item);
    const copied = await authenticatedMutation(
      agent,
      agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
    )
      .send({ selections })
      .expect(201);
    expect(copied.headers['x-resource-version']).toBe('2');
    const exercises = (copied.body as CopyExercisesResponse).data;
    expect(exercises.map((item) => item.type)).toEqual([
      'image',
      'pause',
      'duration',
    ]);
    expect(
      exercises.every(
        (item) =>
          !selections.some((selection) => selection.exerciseId === item.id),
      ),
    ).toBe(true);
    expect(exercises[2]).toMatchObject({
      instructions: 'Movimento controlado.',
      youtubeId: 'ZA8gs8XP2bs',
    });
    const media = exercises[0];
    expect(media?.type === 'image' && media.image?.displayUrl).not.toContain(
      '/source/',
    );
    expect(blobStorage.copyVariant).toHaveBeenCalledTimes(2);
    await trainingPlanModel.deleteOne({ _id: source._id });
    const read = await agent.get(path).expect(200);
    expect(
      (read.body as { data: { exercises: unknown[] } }).data.exercises,
    ).toHaveLength(3);
    await authenticatedMutation(
      agent,
      agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
    )
      .send({ selections })
      .expect(412);
  });

  it('FIT-107 rejects stale sources, read-only or foreign destinations and duplicate selections without writes', async () => {
    const { agent, path } = await libraryDestination();
    const source = await librarySource();
    const library = await agent
      .get('/training-plans/exercise-library')
      .expect(200);
    const selections = (library.body as ExerciseLibraryResponse).data.map(
      ({ exercise: _exercise, ...item }) => item,
    );
    await authenticatedMutation(
      agent,
      agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
    )
      .send({ selections: [selections[0], selections[0]] })
      .expect(400);
    await authenticatedMutation(agent, agent.post(`${path}/exercises/copy`))
      .send({ selections })
      .expect(428);
    await authenticatedMutation(
      agent,
      agent
        .post(
          `${path.replace(/training-plans\/[^/]+/, 'training-plans/74b000000000000000000099')}/exercises/copy`,
        )
        .set('X-Resource-Version', '1'),
    )
      .send({ selections })
      .expect(404);
    const reference = await authenticatedMutation(
      agent,
      agent.post('/training-plans/global-references'),
    )
      .send({ globalTrainingPlanId: source.id })
      .expect(201);
    const referenceId = (reference.body as { data: { catalogEntryId: string } })
      .data.catalogEntryId;
    await authenticatedMutation(
      agent,
      agent
        .post(
          `/training-plans/${referenceId}/workouts/${new Types.ObjectId().toString()}/exercises/copy`,
        )
        .set('X-Resource-Version', '0'),
    )
      .send({ selections })
      .expect(403);
    await trainingPlanModel.updateOne(
      { _id: source._id },
      { $inc: { version: 1 } },
    );
    const stale = await authenticatedMutation(
      agent,
      agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
    )
      .send({ selections })
      .expect(409);
    expect(stale.body).toMatchObject({
      code: 'EXERCISE_LIBRARY_SELECTION_STALE',
    });
    expect(blobStorage.copyVariant).not.toHaveBeenCalled();
  });

  it('FIT-107 compensates all copied variants on a partial media failure and preserves the destination', async () => {
    const { agent, path } = await libraryDestination();
    await librarySource();
    const library = await agent
      .get('/training-plans/exercise-library')
      .expect(200);
    const selections = (library.body as ExerciseLibraryResponse).data.map(
      ({ exercise: _exercise, ...item }) => item,
    );
    blobStorage.copyVariant.mockRejectedValueOnce(new Error('Copy failed'));
    const failed = await authenticatedMutation(
      agent,
      agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
    )
      .send({ selections })
      .expect(503);
    expect(failed.body).toMatchObject({ code: 'EXERCISE_IMAGE_COPY_FAILED' });
    expect(deletedBlobKeys.flat()).toHaveLength(2);
    const read = await agent.get(path).expect(200);
    expect(read.headers['x-resource-version']).toBe('1');
    expect(
      (read.body as { data: { exercises: unknown[] } }).data.exercises,
    ).toHaveLength(0);
  });

  it('FIT-107 retains copied assets when a database response is lost after a successful commit', async () => {
    const { agent, path } = await libraryDestination();
    await librarySource();
    const library = await agent
      .get('/training-plans/exercise-library')
      .expect(200);
    const selections = (library.body as ExerciseLibraryResponse).data.map(
      ({ exercise: _exercise, ...item }) => item,
    );
    const repository = app.get(ExerciseLibraryRepository);
    const append = repository.append.bind(repository);
    const spy = vi
      .spyOn(repository, 'append')
      .mockImplementationOnce(async (...args) => {
        await append(...args);
        throw new Error('Lost response');
      });
    try {
      const failed = await authenticatedMutation(
        agent,
        agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
      )
        .send({ selections })
        .expect(503);
      expect(failed.body).toMatchObject({
        code: 'EXERCISE_COPY_RESULT_UNCERTAIN',
      });
      expect(deletedBlobKeys).toHaveLength(0);
      const read = await agent.get(path).expect(200);
      expect(read.headers['x-resource-version']).toBe('2');
      expect(
        (read.body as { data: { exercises: unknown[] } }).data.exercises,
      ).toHaveLength(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('FIT-107 paginates filtered groups and isolates personal exercises', async () => {
    const { agent, entry, workoutId } = await libraryDestination();
    await trainingPlanModel.updateOne(
      { _id: entry.id, 'workouts._id': workoutId },
      {
        $push: {
          'workouts.$.exercises': {
            _id: new Types.ObjectId(),
            type: 'duration',
            name: 'Privado',
            bodyArea: 'back',
            durationMinutes: 3,
          },
        },
      },
    );
    await createGlobalPlan({
      workouts: [
        {
          _id: new Types.ObjectId(),
          name: 'Origem',
          exercises: Array.from({ length: 25 }, (_, index) => ({
            _id: new Types.ObjectId(),
            type: 'duration',
            name: `Elevação ${String(index).padStart(2, '0')}`,
            bodyArea: 'back',
            durationMinutes: 5,
          })),
        },
      ],
    });
    const first = await agent
      .get('/training-plans/exercise-library?bodyArea=back&page=1')
      .expect(200);
    const second = await agent
      .get('/training-plans/exercise-library?bodyArea=back&page=2')
      .expect(200);
    const firstPage = first.body as ExerciseLibraryResponse;
    const secondPage = second.body as ExerciseLibraryResponse;
    expect(firstPage.total).toBe(25);
    expect(firstPage.data).toHaveLength(20);
    expect(secondPage.data).toHaveLength(5);
    expect(
      new Set(
        [...firstPage.data, ...secondPage.data].map((item) => item.groupId),
      ).size,
    ).toBe(25);
    await authenticatedMutation(
      agent,
      agent
        .post(
          `/training-plans/${entry.catalogEntryId}/workouts/${workoutId}/exercises/copy`,
        )
        .set('X-Resource-Version', '1'),
    )
      .send({ selections: [null] })
      .expect(400);
  });

  it('FIT-107 enforces capacity under simultaneous requests with one winning CAS', async () => {
    const { agent, entry, workoutId, path } = await libraryDestination();
    await librarySource();
    await trainingPlanModel.updateOne(
      { _id: entry.id, 'workouts._id': workoutId },
      {
        $set: {
          'workouts.$.exercises': Array.from({ length: 48 }, () => ({
            _id: new Types.ObjectId(),
            type: 'pause',
            restSeconds: 60,
          })),
        },
      },
    );
    const library = await agent
      .get('/training-plans/exercise-library')
      .expect(200);
    const selections = (library.body as ExerciseLibraryResponse).data
      .filter((item) => item.exercise.type !== 'image')
      .map(({ exercise: _exercise, ...item }) => item);
    const send = () =>
      authenticatedMutation(
        agent,
        agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
      ).send({ selections });
    const responses = await Promise.all([send(), send()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 412,
    ]);
    const current = await agent.get(path).expect(200);
    expect(
      (current.body as { data: { exercises: unknown[] } }).data.exercises,
    ).toHaveLength(50);
    await authenticatedMutation(
      agent,
      agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '2'),
    )
      .send({ selections })
      .expect(409);
  });

  it('FIT-107 rejects the BSON candidate before appending any part of the batch', async () => {
    const { agent, entry, path } = await libraryDestination();
    await librarySource();
    const [before] = await trainingPlanModel.aggregate<{ bytes: number }>([
      { $match: { _id: new Types.ObjectId(entry.id) } },
      { $project: { bytes: { $bsonSize: '$$ROOT' } } },
    ]);
    if (before === undefined) throw new Error('Missing destination.');
    await trainingPlanModel.collection.updateOne(
      { _id: new Types.ObjectId(entry.id) },
      {
        $set: {
          description: 'x'.repeat(
            12 * 1024 * 1024 - before.bytes - 100 + 'Destino da cópia.'.length,
          ),
        },
      },
    );
    const library = await agent
      .get('/training-plans/exercise-library')
      .expect(200);
    const selections = (library.body as ExerciseLibraryResponse).data
      .filter((item) => item.exercise.type !== 'image')
      .map(({ exercise: _exercise, ...item }) => item);
    const result = await authenticatedMutation(
      agent,
      agent.post(`${path}/exercises/copy`).set('X-Resource-Version', '1'),
    )
      .send({ selections })
      .expect(409);
    expect(result.body).toMatchObject({
      code: 'TRAINING_PLAN_SIZE_LIMIT_REACHED',
    });
    const current = await agent.get(path).expect(200);
    expect(
      (current.body as { data: { exercises: unknown[] } }).data.exercises,
    ).toHaveLength(0);
    expect(current.headers['x-resource-version']).toBe('1');
  });

  async function advanceAssistantToNeutralScreening(
    agent: ReturnType<typeof request.agent>,
  ): Promise<TrainingPlanAssistantSessionResponse['data']> {
    const created = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session'),
    )
      .send({ noticeVersion: 'assistant-notice.v1' })
      .expect(201);
    let session = (created.body as TrainingPlanAssistantSessionResponse).data;

    for (let messageNumber = 1; messageNumber <= 30; messageNumber += 1) {
      if (session.currentPrompt === neutralProfessionalFollowUpPrompt)
        return session;
      const answer = session.availableAnswers[0];
      if (answer === undefined)
        throw new Error('Assistant stopped before neutral screening.');
      const response = await authenticatedMutation(
        agent,
        agent.post('/training-plan-assistant/session/messages'),
      )
        .set('X-Resource-Version', String(session.version))
        .send({
          clientMessageId: `123e4567-e89b-42d3-a456-${String(messageNumber).padStart(12, '0')}`,
          text: answer.value,
        })
        .expect(200);
      session = (response.body as TrainingPlanAssistantSessionResponse).data;
    }

    throw new Error('Assistant did not reach neutral screening.');
  }

  it.each(['yes', 'unknown'] as const)(
    'uses neutral screening and blocks the %s answer without name inference',
    async (answer) => {
      const agent = await login(false);
      const session = await advanceAssistantToNeutralScreening(agent);

      expect(session.currentPrompt).toBe(neutralProfessionalFollowUpPrompt);
      expect(session.currentPrompt).not.toBe(
        'Você está em gestação ou pós-parto?',
      );
      const response = await authenticatedMutation(
        agent,
        agent.post('/training-plan-assistant/session/messages'),
      )
        .set('X-Resource-Version', String(session.version))
        .send({
          clientMessageId:
            answer === 'yes'
              ? '123e4567-e89b-42d3-a456-900000000001'
              : '123e4567-e89b-42d3-a456-900000000002',
          text: answer,
        })
        .expect(200);
      const blocked = (response.body as TrainingPlanAssistantSessionResponse)
        .data;

      expect(blocked).toMatchObject({
        currentPrompt: null,
        screeningOutcome: 'requer_avaliacao_profissional',
        status: 'blocked',
      });
    },
  );

  it('creates, resumes, drafts and idempotently materializes an assistant plan', async () => {
    const agent = await login(false);
    const empty = await agent
      .get('/training-plan-assistant/session')
      .expect(204);
    expect(empty.headers['cache-control']).toBe('private, no-store');

    const created = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session'),
    )
      .send({ noticeVersion: 'assistant-notice.v1' })
      .expect(201);
    let session = (created.body as TrainingPlanAssistantSessionResponse).data;

    const resumed = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session'),
    )
      .send({ noticeVersion: 'assistant-notice.v1' })
      .expect(200);
    expect((resumed.body as TrainingPlanAssistantSessionResponse).data.id).toBe(
      session.id,
    );

    let messageNumber = 0;
    while (session.status === 'collecting') {
      const answer = session.availableAnswers[0];
      expect(answer).toBeDefined();
      const isSchedule = session.currentPrompt?.includes(
        'frequência e duração',
      );
      const isExperience = session.currentPrompt?.includes(
        'experiência com treino',
      );
      if (isExperience) {
        messageNumber += 1;
        const anticipatedResponse = await authenticatedMutation(
          agent,
          agent.post('/training-plan-assistant/session/messages'),
        )
          .set('X-Resource-Version', String(session.version))
          .send({
            clientMessageId: `123e4567-e89b-42d3-a456-${String(messageNumber).padStart(12, '0')}`,
            text: 'já treinei por um ano inteiro, mas estou parado a 3 meses',
          })
          .expect(200);
        session = (
          anticipatedResponse.body as TrainingPlanAssistantSessionResponse
        ).data;
        expect(session.status).toBe('clarifying');
        expect(session.messages.at(-1)?.text).toContain('Até 3 meses');
        expect(session.messages.at(-1)?.text).toContain(
          'familiaridade com os exercícios',
        );
        expect(session.currentPrompt).toContain('experiência com treino');
      }
      let text = answer?.value;
      if (isSchedule)
        text = 'consigo treinar 5 dias por semana, uns 45 minutos por dia';
      if (isExperience) text = 'beginner';
      messageNumber += 1;
      const response = await authenticatedMutation(
        agent,
        agent.post('/training-plan-assistant/session/messages'),
      )
        .set('X-Resource-Version', String(session.version))
        .send({
          clientMessageId: `123e4567-e89b-42d3-a456-${String(messageNumber).padStart(12, '0')}`,
          text,
        })
        .expect(200);
      session = (response.body as TrainingPlanAssistantSessionResponse).data;
      let expectedVisibleText = text === answer?.value ? answer?.label : text;
      if (isExperience) expectedVisibleText = 'Iniciante';
      expect(
        session.messages.findLast((message) => message.role === 'person')?.text,
      ).toBe(expectedVisibleText);
    }
    expect(messageNumber).toBeLessThanOrEqual(22);
    expect(session.status).toBe('ready');

    const conflictResponse = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session/messages'),
    )
      .set('X-Resource-Version', String(session.version - 1))
      .send({
        clientMessageId: '123e4567-e89b-42d3-a456-999999999999',
        text: 'general-health',
      })
      .expect(412);
    expect((conflictResponse.body as { code: string }).code).toBe(
      'ASSISTANT_SESSION_VERSION_CONFLICT',
    );

    const draftKey = '123e4567-e89b-42d3-a456-426614174001';
    const draftResponse = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session/drafts'),
    )
      .set('Idempotency-Key', draftKey)
      .set('X-Resource-Version', String(session.version))
      .send({})
      .expect(200);
    session = (draftResponse.body as TrainingPlanAssistantSessionResponse).data;
    expect(session.status).toBe('preview');
    expect(session.draft?.workouts).toHaveLength(5);

    const previewBeforeInvalidDraft = session.draft;
    const invalidDraftResponse = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session/drafts'),
    )
      .set('Idempotency-Key', '123e4567-e89b-42d3-a456-426614174009')
      .set('X-Resource-Version', String(session.version))
      .send({ adjustment: 'assistant:draft-invalid' })
      .expect(502);
    expect((invalidDraftResponse.body as { code: string }).code).toBe(
      'ASSISTANT_DRAFT_INVALID',
    );
    const recoveredPreview = await agent
      .get('/training-plan-assistant/session')
      .expect(200);
    session = (recoveredPreview.body as TrainingPlanAssistantSessionResponse)
      .data;
    expect(session.status).toBe('preview');
    expect(session.draft).toEqual(previewBeforeInvalidDraft);

    const confirmationKey = '123e4567-e89b-42d3-a456-426614174002';
    const confirmation = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session/confirm'),
    )
      .set('Idempotency-Key', confirmationKey)
      .set('X-Resource-Version', String(session.version))
      .send({})
      .expect(201);
    const confirmationData = (
      confirmation.body as {
        data: { catalogEntryId: string; trainingPlanId: string };
      }
    ).data;
    expect(
      await trainingPlanModel.countDocuments({
        _id: confirmationData.trainingPlanId,
      }),
    ).toBe(1);
    expect(
      await catalogModel.countDocuments({
        _id: confirmationData.catalogEntryId,
      }),
    ).toBe(1);
    expect(await activeModel.countDocuments({})).toBe(0);
    expect(await assistantSessionModel.countDocuments({})).toBe(0);

    const replay = await authenticatedMutation(
      agent,
      agent.post('/training-plan-assistant/session/confirm'),
    )
      .set('Idempotency-Key', confirmationKey)
      .set('X-Resource-Version', String(session.version))
      .send({})
      .expect(200);
    expect(
      (
        replay.body as {
          data: { catalogEntryId: string; trainingPlanId: string };
        }
      ).data,
    ).toEqual(confirmationData);

    const detail = await agent
      .get(`/training-plans/${confirmationData.catalogEntryId}`)
      .expect(200);
    const workout = (detail.body as { data: { workouts: { id: string }[] } })
      .data.workouts[0];
    expect(workout).toBeDefined();
    const workoutResponse = await agent
      .get(
        `/training-plans/${confirmationData.catalogEntryId}/workouts/${workout?.id}`,
      )
      .expect(200);
    const savedExercises = (
      workoutResponse.body as {
        data: {
          exercises: {
            id: string;
            type: string;
            durationMinutes?: number;
            instructions?: string;
            youtubeId?: string;
          }[];
        };
      }
    ).data.exercises;
    expect(savedExercises).toContainEqual(
      expect.objectContaining({
        type: 'duration',
        durationMinutes: 5,
        name: 'Esteira: caminhada',
      }),
    );
    const savedStretch = savedExercises.find(
      (exercise) => exercise.youtubeId === 'yFvf_tdVook',
    );
    expect(savedStretch).toMatchObject({
      type: 'duration',
      durationMinutes: 2,
    });
    expect(savedStretch?.instructions).toContain('10–20 s');
    await authenticatedMutation(agent, agent.put('/training-plans/active'))
      .send({ active: true, catalogEntryId: confirmationData.catalogEntryId })
      .expect(200);
    const execution = await authenticatedMutation(
      agent,
      agent.post(`/training/workouts/${workout?.id}/session`),
    )
      .send({})
      .expect(201);
    const executionBody = execution.body as {
      data: {
        exercises: {
          type: string;
          durationMinutes?: number;
          youtubeId?: string;
        }[];
      };
    };
    expect(executionBody.data.exercises).toContainEqual(
      expect.objectContaining({
        type: 'duration',
        durationMinutes: 2,
        youtubeId: 'yFvf_tdVook',
      }),
    );
    const warmup = savedExercises[0];
    const timer = await authenticatedMutation(
      agent,
      agent.post(`/training/session/exercises/${warmup?.id}/timer`),
    )
      .set('X-Resource-Version', '0')
      .send({ kind: 'duration' })
      .expect(201);
    expect(timer.body).toMatchObject({
      data: { activeTimer: { kind: 'duration' } },
    });
  });

  it('protects and validates the realtime stream before opening it', async () => {
    await request(app.getHttpServer())
      .get(
        '/realtime/events?clientInstanceId=123e4567-e89b-42d3-a456-426614174000',
      )
      .set('Accept', 'text/event-stream')
      .expect(401);

    const admin = await login(true);
    const invalid = await admin
      .get('/realtime/events?clientInstanceId=invalid')
      .set('Accept', 'text/event-stream')
      .expect(400);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('publishes a committed mutation with its document origin', async () => {
    const subscriber = new Redis(process.env.REDIS_URL!);
    const messagePromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Realtime event was not published.')),
        3_000,
      );
      subscriber.once('message', (_channel, message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
    await subscriber.subscribe('dall-fit-training-e2e:test:realtime:events');
    const admin = await login(true);
    await authenticatedMutation(
      admin,
      admin
        .post('/global/training-plans')
        .set('X-Client-Instance-Id', '123e4567-e89b-42d3-a456-426614174000')
        .send({ name: 'Plano SSE', description: 'Publicação pós-commit.' }),
    ).expect(201);

    const event = JSON.parse(await messagePromise) as Record<string, unknown>;
    expect(event).toMatchObject({
      audience: 'admin',
      originClientInstanceId: '123e4567-e89b-42d3-a456-426614174000',
      event: {
        resource: 'global-training-plan',
        state: 'present',
        version: 0,
      },
    });
    await subscriber.quit();
  });

  it('protects every operation with authentication and administrative authorization', async () => {
    const planId = new Types.ObjectId().toString();
    const workoutId = new Types.ObjectId().toString();
    const exerciseId = new Types.ObjectId().toString();
    const workoutPath = `/global/training-plans/${planId}/workouts/${workoutId}`;
    const exercisePath = `${workoutPath}/exercises/${exerciseId}`;
    const operations = [
      ['get', '/global/training-plans'],
      ['post', '/global/training-plans'],
      ['get', `/global/training-plans/${planId}`],
      ['patch', `/global/training-plans/${planId}`],
      ['delete', `/global/training-plans/${planId}`],
      ['post', `/global/training-plans/${planId}/workouts`],
      ['delete', workoutPath],
      ['get', workoutPath],
      ['patch', workoutPath],
      ['post', `${workoutPath}/exercises`],
      ['put', `${workoutPath}/exercises/order`],
      ['patch', exercisePath],
      ['delete', exercisePath],
      ['put', `${exercisePath}/image`],
      ['delete', `${exercisePath}/image`],
    ] as const;

    for (const [method, path] of operations) {
      const response = await request(app.getHttpServer())
        [method](path)
        .send({});
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'AUTHENTICATION_REQUIRED',
      });
    }

    const personAgent = await login(false);
    for (const [method, path] of operations) {
      const response = await personAgent[method](path).send({});
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'ADMIN_ACCESS_REQUIRED' });
    }
  });

  it('creates, normalizes, updates and deletes a global plan as one persisted document', async () => {
    const agent = await login(true);
    const createResponse = await authenticatedMutation(
      agent,
      agent.post('/global/training-plans'),
    ).send({
      name: '  Plano hipertrofia  ',
      description: '  Um plano global completo.  ',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers['x-resource-version']).toBe('0');
    expect(createResponse.body).toMatchObject({
      data: {
        name: 'Plano hipertrofia',
        description: 'Um plano global completo.',
        version: 0,
      },
    });
    const planId = (createResponse.body as { data: { id: string } }).data.id;
    const persisted = await trainingPlanModel.findById(planId).lean().exec();
    expect(persisted).toMatchObject({
      ownerPersonId: null,
      name: 'Plano hipertrofia',
      description: 'Um plano global completo.',
      workouts: [],
    });

    const updateResponse = await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.patch(`/global/training-plans/${planId}`),
        planId,
        0,
      ),
    ).send({ name: '  Plano atualizado  ' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.headers['x-resource-version']).toBe('1');
    expect(updateResponse.body).toMatchObject({
      data: {
        id: planId,
        name: 'Plano atualizado',
        description: 'Um plano global completo.',
      },
    });

    await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.delete(`/global/training-plans/${planId}`),
        planId,
        1,
      ),
    ).expect(204);
    await expect(trainingPlanModel.findById(planId).exec()).resolves.toBeNull();
  });

  it('lists only global plans, ordered by creation and paginated in fixed pages of twenty', async () => {
    const agent = await login(true);
    const baseDate = new Date('2026-01-01T12:00:00.000Z');
    const documents = Array.from({ length: 21 }, (_, index) => ({
      ownerPersonId: null,
      name: `Plano ${String(index + 1).padStart(2, '0')}`,
      description: `Descrição ${index + 1}`,
      workouts: [{ name: 'Treino oculto', exercises: [] }],
      createdAt: new Date(baseDate.getTime() + index * 1000),
      updatedAt: new Date(baseDate.getTime() + index * 1000),
    }));
    await trainingPlanModel.collection.insertMany(documents);
    await trainingPlanModel.create({
      ownerPersonId: new Types.ObjectId(),
      name: 'Plano pessoal',
      description: 'Não pode aparecer.',
      workouts: [],
    });

    const firstPage = await agent.get('/global/training-plans?page=1');
    const secondPage = await agent.get('/global/training-plans?page=2');
    const firstPageBody =
      firstPage.body as GlobalTrainingPlanCollectionResponse;
    const secondPageBody =
      secondPage.body as GlobalTrainingPlanCollectionResponse;

    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({ page: 1, pageSize: 20, total: 21 });
    expect(firstPageBody.data).toHaveLength(20);
    expect(firstPageBody.data[0]).toMatchObject({ name: 'Plano 21' });
    expect(firstPageBody.data[0]).not.toHaveProperty('workouts');
    expect(secondPage.body).toMatchObject({ page: 2, pageSize: 20, total: 21 });
    expect(secondPageBody.data).toHaveLength(1);
    expect(secondPageBody.data[0]).toMatchObject({ name: 'Plano 01' });
  });

  it('returns workout summaries without exposing exercises and cascades them with the plan', async () => {
    const agent = await login(true);
    const plan = await createGlobalPlan({
      workouts: [
        {
          _id: new Types.ObjectId(),
          name: 'Treino A',
          exercises: [
            { type: 'pause', restSeconds: 60 },
            {
              type: 'duration',
              name: 'Supino',
              bodyArea: 'chest',
              durationMinutes: 10,
            },
          ],
        },
      ],
    });

    const detailResponse = await agent.get(`/global/training-plans/${plan.id}`);
    const detailBody = detailResponse.body as TrainingPlanDetailsResponse;
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.headers['x-resource-version']).toBe('0');
    expect(detailResponse.body).toMatchObject({
      data: {
        id: plan.id,
        workouts: [{ name: 'Treino A', exerciseCount: 2 }],
      },
    });
    expect(detailBody.data.workouts[0]).not.toHaveProperty('exercises');

    await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.delete(`/global/training-plans/${plan.id}`),
        plan.id,
        0,
      ),
    ).expect(204);
    await expect(
      trainingPlanModel.findById(plan.id).exec(),
    ).resolves.toBeNull();
  });

  it('creates a workout atomically with a real id and deletes only that embedded item', async () => {
    const agent = await login(true);
    const preservedWorkoutId = new Types.ObjectId();
    const plan = await createGlobalPlan({
      workouts: [
        {
          _id: preservedWorkoutId,
          name: 'Treino preservado',
          exercises: [{ type: 'pause', restSeconds: 60 }],
        },
      ],
    });

    const createResponse = await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.post(`/global/training-plans/${plan.id}/workouts`),
        plan.id,
        0,
      ),
    ).send({});
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      data: { name: 'Novo treino', exerciseCount: 0 },
    });
    const workoutId = (createResponse.body as { data: { id: string } }).data.id;
    expect(Types.ObjectId.isValid(workoutId)).toBe(true);

    const afterCreate = await trainingPlanModel.findById(plan.id).lean().exec();
    expect(afterCreate?.workouts).toHaveLength(2);
    expect(afterCreate?.workouts[1]).toMatchObject({
      _id: new Types.ObjectId(workoutId),
      name: 'Novo treino',
      exercises: [],
    });

    await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.delete(`/global/training-plans/${plan.id}/workouts/${workoutId}`),
        plan.id,
        1,
      ),
    ).expect(204);
    const afterDelete = await trainingPlanModel.findById(plan.id).lean().exec();
    expect(afterDelete?.workouts).toHaveLength(1);
    expect(afterDelete?.workouts[0]?._id.toString()).toBe(
      preservedWorkoutId.toString(),
    );
  });

  it('hides personal and missing resources behind stable not-found errors', async () => {
    const agent = await login(true);
    const personalPlan = await createGlobalPlan({
      ownerPersonId: new Types.ObjectId(),
    });
    const globalPlan = await createGlobalPlan();
    const missingPlanId = new Types.ObjectId().toString();
    const missingWorkoutId = new Types.ObjectId().toString();

    for (const planId of [personalPlan.id, missingPlanId]) {
      const getResponse = await agent.get(`/global/training-plans/${planId}`);
      const patchResponse = await authenticatedMutation(
        agent,
        withResourceVersion(
          agent.patch(`/global/training-plans/${planId}`),
          planId,
          0,
        ),
      ).send({ name: 'Não atualiza' });
      const deleteResponse = await authenticatedMutation(
        agent,
        withResourceVersion(
          agent.delete(`/global/training-plans/${planId}`),
          planId,
          0,
        ),
      );
      const workoutResponse = await authenticatedMutation(
        agent,
        withResourceVersion(
          agent.post(`/global/training-plans/${planId}/workouts`),
          planId,
          0,
        ),
      ).send({});

      for (const response of [
        getResponse,
        patchResponse,
        deleteResponse,
        workoutResponse,
      ]) {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          code: 'TRAINING_PLAN_NOT_FOUND',
        });
      }
    }

    const missingWorkoutResponse = await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.delete(
          `/global/training-plans/${globalPlan.id}/workouts/${missingWorkoutId}`,
        ),
        globalPlan.id,
        0,
      ),
    );
    const missingPlanWorkoutResponse = await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.delete(
          `/global/training-plans/${missingPlanId}/workouts/${missingWorkoutId}`,
        ),
        missingPlanId,
        0,
      ),
    );
    expect(missingWorkoutResponse.status).toBe(404);
    expect(missingWorkoutResponse.body).toMatchObject({
      code: 'WORKOUT_NOT_FOUND',
    });
    expect(missingPlanWorkoutResponse.status).toBe(404);
    expect(missingPlanWorkoutResponse.body).toMatchObject({
      code: 'TRAINING_PLAN_NOT_FOUND',
    });
  });

  it('rejects malformed input with the stable validation error', async () => {
    const agent = await login(true);
    const plan = await createGlobalPlan();
    const invalidRequests = [
      () => agent.get('/global/training-plans?page=0'),
      () => agent.get('/global/training-plans?page=1.5'),
      () => agent.get('/global/training-plans?page=101'),
      () => agent.get('/global/training-plans/not-an-id'),
      () =>
        authenticatedMutation(agent, agent.post('/global/training-plans')).send(
          { name: ' ', description: 'x' },
        ),
      () =>
        authenticatedMutation(agent, agent.post('/global/training-plans')).send(
          {
            name: 'Plano',
            description: 'Descrição',
            unexpected: true,
          },
        ),
      () =>
        authenticatedMutation(
          agent,
          agent.patch(`/global/training-plans/${plan.id}`),
        ).send({}),
      () =>
        authenticatedMutation(
          agent,
          agent.post(`/global/training-plans/${plan.id}/workouts`),
        ).send({ unexpected: true }),
    ];

    for (const makeRequest of invalidRequests) {
      const response = await makeRequest();
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'VALIDATION_ERROR',
        details: {},
        message: 'Request validation failed.',
        requestId: response.headers['x-request-id'],
      });
    }
  });

  it('edits a workout with typed exercises, stable ordering and aggregate concurrency', async () => {
    const agent = await login(true);
    const workoutId = new Types.ObjectId();
    const plan = await createGlobalPlan({
      workouts: [{ _id: workoutId, name: 'Treino inicial', exercises: [] }],
    });
    const basePath = `/global/training-plans/${plan.id}/workouts/${workoutId.toString()}`;

    const getResponse = await agent.get(basePath);
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers['x-resource-version']).toBe('0');
    expect(getResponse.body).toMatchObject({
      data: {
        id: workoutId.toString(),
        name: 'Treino inicial',
        version: 0,
        exercises: [],
      },
    });

    const nameResponse = await authenticatedMutation(
      agent,
      withResourceVersion(agent.patch(basePath), plan.id, 0),
    ).send({ name: '  Treino editado  ' });
    expect(nameResponse.status).toBe(200);
    expect(nameResponse.headers['x-resource-version']).toBe('1');
    expect(nameResponse.body).toMatchObject({
      data: { name: 'Treino editado' },
    });

    const types = [
      'youtube-short',
      'image',
      'youtube-long',
      'pause',
      'duration',
    ] as const;
    const exercises: Array<{ id: string; type: string }> = [];
    for (const [index, type] of types.entries()) {
      const createResponse = await authenticatedMutation(
        agent,
        withResourceVersion(
          agent.post(`${basePath}/exercises`),
          plan.id,
          index + 1,
        ),
      ).send({ type });
      expect(createResponse.status).toBe(201);
      expect(createResponse.headers['x-resource-version']).toBe(
        String(index + 2),
      );
      expect(createResponse.body).toMatchObject({ data: { type } });
      exercises.push(
        (createResponse.body as { data: { id: string; type: string } }).data,
      );
    }

    const pause = exercises.find((exercise) => exercise.type === 'pause');
    expect(pause).toBeDefined();
    const updateResponse = await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.patch(`${basePath}/exercises/${pause?.id}`),
        plan.id,
        6,
      ),
    ).send({ restSeconds: 90 });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      data: { id: pause?.id, type: 'pause', restSeconds: 90 },
    });

    const reversedIds = exercises.map((exercise) => exercise.id).reverse();
    const reorderResponse = await authenticatedMutation(
      agent,
      withResourceVersion(agent.put(`${basePath}/exercises/order`), plan.id, 7),
    ).send({ exerciseIds: reversedIds });
    expect(reorderResponse.status).toBe(204);
    expect(reorderResponse.headers['x-resource-version']).toBe('8');

    const noOpResponse = await authenticatedMutation(
      agent,
      withResourceVersion(agent.put(`${basePath}/exercises/order`), plan.id, 8),
    ).send({ exerciseIds: reversedIds });
    expect(noOpResponse.status).toBe(204);
    expect(noOpResponse.headers['x-resource-version']).toBe('8');

    const conflictResponse = await authenticatedMutation(
      agent,
      withResourceVersion(agent.patch(basePath), plan.id, 7),
    ).send({ name: 'Não sobrescreve' });
    expect(conflictResponse.status).toBe(412);
    expect(conflictResponse.body).toMatchObject({
      code: 'TRAINING_PLAN_VERSION_CONFLICT',
    });

    const finalRead = await agent.get(basePath);
    expect(finalRead.body).toMatchObject({
      data: { name: 'Treino editado', version: 8 },
    });
    expect(
      (
        finalRead.body as { data: { exercises: Array<{ id: string }> } }
      ).data.exercises.map((exercise) => exercise.id),
    ).toEqual(reversedIds);
  });

  it('processes multipart images through Sharp and keeps Blob cleanup consistent', async () => {
    const agent = await login(true);
    const workoutId = new Types.ObjectId();
    const exerciseId = new Types.ObjectId();
    const plan = await createGlobalPlan({
      workouts: [
        {
          _id: workoutId,
          name: 'Treino com imagem',
          exercises: [
            {
              _id: exerciseId,
              type: 'image',
              name: 'Agachamento',
              image: null,
              bodyArea: 'quadriceps',
              restSeconds: 60,
              sets: 3,
              repetitions: 12,
            },
          ],
        },
      ],
    });
    const imagePath = `/global/training-plans/${plan.id}/workouts/${workoutId.toString()}/exercises/${exerciseId.toString()}/image`;
    const jpeg = await sharp({
      create: {
        background: { alpha: 1, b: 50, g: 100, r: 200 },
        channels: 4,
        height: 800,
        width: 1200,
      },
    })
      .jpeg()
      .toBuffer();

    const uploadResponse = await authenticatedMutation(
      agent,
      withResourceVersion(agent.put(imagePath), plan.id, 0),
    ).attach('file', jpeg, {
      contentType: 'image/jpeg',
      filename: 'exercise.jpg',
    });

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.headers['x-resource-version']).toBe('1');
    const uploadBody = uploadResponse.body as {
      data: {
        image: {
          displayUrl: string;
          signedUrlExpiresAt: string;
          thumbnailUrl: string;
        };
      };
    };
    expect(uploadResponse.headers['cache-control']).toBe('private, no-store');
    expect(uploadBody.data.image.displayUrl).toMatch(
      /\/exercise-images\/[a-f0-9]{24}\/display\.webp\?/u,
    );
    expect(uploadBody.data.image.thumbnailUrl).toMatch(
      /\/exercise-images\/[a-f0-9]{24}\/thumbnail\.webp\?/u,
    );
    expect(uploadBody.data.image.displayUrl).toContain(
      'vercel-blob-delegation=fake',
    );
    expect(
      Date.parse(uploadBody.data.image.signedUrlExpiresAt),
    ).toBeGreaterThan(Date.now());
    const expectedExpiration = String(
      Date.parse(uploadBody.data.image.signedUrlExpiresAt),
    );
    expect(
      new URL(uploadBody.data.image.thumbnailUrl).searchParams.get(
        'vercel-blob-signature',
      ),
    ).toBe(expectedExpiration);
    expect(
      new URL(uploadBody.data.image.displayUrl).searchParams.get(
        'vercel-blob-signature',
      ),
    ).toBe(expectedExpiration);
    expect(JSON.stringify(uploadBody)).not.toContain('"key"');
    expect(uploadedBlobs).toHaveLength(2);
    const [thumbnailMetadata, displayMetadata] = await Promise.all(
      uploadedBlobs.map(({ content }) => sharp(content).metadata()),
    );
    expect(thumbnailMetadata).toMatchObject({
      format: 'webp',
      height: 107,
      width: 160,
    });
    expect(displayMetadata).toMatchObject({
      format: 'webp',
      height: 720,
      width: 1080,
    });
    const storedAfterUpload = await trainingPlanModel
      .findById(plan.id)
      .lean()
      .exec();
    const persistedImage = (
      storedAfterUpload?.workouts[0]?.exercises[0] as {
        image?: {
          display?: { height?: number; key?: string; width?: number };
          thumbnail?: { height?: number; key?: string; width?: number };
        };
      }
    )?.image;
    expect(persistedImage?.display?.height).toBe(720);
    expect(persistedImage?.display?.key).toMatch(
      /^exercise-images\/[a-f0-9]{24}\/display\.webp$/u,
    );
    expect(persistedImage?.display?.width).toBe(1080);
    expect(persistedImage?.thumbnail?.height).toBe(107);
    expect(persistedImage?.thumbnail?.key).toMatch(
      /^exercise-images\/[a-f0-9]{24}\/thumbnail\.webp$/u,
    );
    expect(persistedImage?.thumbnail?.width).toBe(160);
    expect(JSON.stringify(persistedImage)).not.toContain('"url"');

    const workoutResponse = await agent
      .get(`/global/training-plans/${plan.id}/workouts/${workoutId.toString()}`)
      .expect(200);
    expect(workoutResponse.headers['cache-control']).toBe('private, no-store');
    expect(JSON.stringify(workoutResponse.body)).not.toContain('"key"');

    const removeResponse = await authenticatedMutation(
      agent,
      withResourceVersion(agent.delete(imagePath), plan.id, 1),
    );
    expect(removeResponse.status).toBe(204);
    expect(removeResponse.headers['x-resource-version']).toBe('2');
    expect(deletedBlobKeys).toEqual([uploadedBlobs.map(({ key }) => key)]);
    const stored = await trainingPlanModel.findById(plan.id).lean().exec();
    expect(stored?.workouts[0]?.exercises[0]).toMatchObject({ image: null });
  });

  it('authorizes workout image signing and fails the whole read when signing is unavailable', async () => {
    const workoutId = new Types.ObjectId();
    const exerciseId = new Types.ObjectId();
    const plan = await createGlobalPlan({
      workouts: [
        {
          _id: workoutId,
          name: 'Treino privado',
          exercises: [
            {
              _id: exerciseId,
              type: 'image',
              name: 'Imagem privada',
              bodyArea: 'other',
              restSeconds: 60,
              sets: 3,
              repetitions: 12,
              image: {
                thumbnail: {
                  height: 160,
                  key: 'exercise-images/private-thumbnail.webp',
                  width: 160,
                },
                display: {
                  height: 640,
                  key: 'exercise-images/private-display.webp',
                  width: 320,
                },
              },
            },
          ],
        },
      ],
    });
    const path = `/global/training-plans/${plan.id}/workouts/${workoutId.toString()}`;
    const callsBeforeAuthorization =
      blobStorage.createSignedReadUrl.mock.calls.length;

    await request(app.getHttpServer()).get(path).expect(401);
    const regularAgent = await login(false);
    await regularAgent.get(path).expect(403);
    expect(blobStorage.createSignedReadUrl).toHaveBeenCalledTimes(
      callsBeforeAuthorization,
    );

    blobStorage.createSignedReadUrl.mockRejectedValueOnce(
      new Error('signing unavailable'),
    );
    const adminAgent = await login(true);
    const response = await adminAgent.get(path).expect(503);
    const body = response.body as { code?: string; data?: unknown };

    expect(body.code).toBe('IMAGE_URL_SIGNING_FAILED');
    expect(body).not.toHaveProperty('data');
  });

  it('persists the canonical YouTube id returned by the deterministic adapter', async () => {
    const agent = await login(true);
    const workoutId = new Types.ObjectId();
    const exerciseId = new Types.ObjectId();
    const plan = await createGlobalPlan({
      workouts: [
        {
          _id: workoutId,
          name: 'Treino com vídeo',
          exercises: [
            {
              _id: exerciseId,
              type: 'youtube-long',
              name: 'Mobilidade',
              youtubeId: '2isq0vuKruE',
              bodyArea: 'mobility',
            },
          ],
        },
      ],
    });
    const exercisePath = `/global/training-plans/${plan.id}/workouts/${workoutId.toString()}/exercises/${exerciseId.toString()}`;
    const reference = 'https://youtu.be/ZA8gs8XP2bs';

    const response = await authenticatedMutation(
      agent,
      withResourceVersion(agent.patch(exercisePath), plan.id, 0),
    ).send({ youtubeId: reference });

    expect(response.status).toBe(200);
    expect(response.headers['x-resource-version']).toBe('1');
    expect(response.body).toMatchObject({
      data: { type: 'youtube-long', youtubeId: 'ZA8gs8XP2bs' },
    });
    expect(youtubeReference.normalizeAndValidate).toHaveBeenCalledWith(
      reference,
    );
    const stored = await trainingPlanModel.findById(plan.id).lean().exec();
    expect(stored?.workouts[0]?.exercises[0]).toMatchObject({
      youtubeId: 'ZA8gs8XP2bs',
    });
  });

  it('enforces preconditions, aggregate limits and the operational BSON boundary', async () => {
    const agent = await login(true);
    const workoutId = new Types.ObjectId();
    const plan = await createGlobalPlan({
      workouts: [{ _id: workoutId, name: 'Limites', exercises: [] }],
    });
    const path = `/global/training-plans/${plan.id}/workouts/${workoutId.toString()}`;

    const missing = await authenticatedMutation(agent, agent.patch(path)).send({
      name: 'Sem versão',
    });
    expect(missing.status).toBe(428);
    expect(missing.body).toMatchObject({
      code: 'PRECONDITION_REQUIRED',
      message: 'X-Resource-Version is required.',
    });
    const legacyHeader = await authenticatedMutation(
      agent,
      agent.patch(path).set('If-Match', '"training-plan:legacy:0"'),
    ).send({ name: 'Versão legada' });
    expect(legacyHeader.status).toBe(428);
    expect(legacyHeader.body).toMatchObject({
      code: 'PRECONDITION_REQUIRED',
    });
    const malformed = await authenticatedMutation(
      agent,
      agent.patch(path).set('X-Resource-Version', 'invalid'),
    ).send({ name: 'Versão fraca' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    const unsafe = await authenticatedMutation(
      agent,
      agent
        .patch(path)
        .set('X-Resource-Version', String(Number.MAX_SAFE_INTEGER + 1)),
    ).send({ name: 'Versão insegura' });
    expect(unsafe.status).toBe(400);
    expect(unsafe.body).toMatchObject({ code: 'VALIDATION_ERROR' });

    const fullExercises = Array.from({ length: 50 }, () => ({
      type: 'duration',
      name: 'x'.repeat(40),
      bodyArea: 'cardio',
      durationMinutes: 1440,
    }));
    const fullWorkouts = Array.from({ length: 25 }, (_, index) => ({
      _id: index === 0 ? workoutId : new Types.ObjectId(),
      name: `Treino ${index}`.padEnd(120, 'x'),
      exercises: fullExercises,
    }));
    await trainingPlanModel
      .updateOne(
        { _id: plan._id },
        { $set: { workouts: fullWorkouts } },
        { runValidators: true },
      )
      .exec();

    const workoutLimit = await authenticatedMutation(
      agent,
      withResourceVersion(
        agent.post(`/global/training-plans/${plan.id}/workouts`),
        plan.id,
        0,
      ),
    ).send({});
    expect(workoutLimit.status).toBe(409);
    expect(workoutLimit.body).toMatchObject({ code: 'WORKOUT_LIMIT_REACHED' });
    const exerciseLimit = await authenticatedMutation(
      agent,
      withResourceVersion(agent.post(`${path}/exercises`), plan.id, 0),
    ).send({ type: 'pause' });
    expect(exerciseLimit.status).toBe(409);
    expect(exerciseLimit.body).toMatchObject({
      code: 'EXERCISE_LIMIT_REACHED',
    });

    const [sizeResult] = await trainingPlanModel
      .aggregate<{ size: number }>([
        { $match: { _id: plan._id } },
        { $project: { size: { $bsonSize: '$$ROOT' } } },
      ])
      .exec();
    expect(sizeResult?.size).toBeLessThan(12 * 1024 * 1024);
  });

  it('creates the compound owner and creation index', async () => {
    const indexes = await trainingPlanModel.collection.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: { ownerPersonId: 1, createdAt: -1, _id: -1 },
        }),
      ]),
    );
  });

  it('keeps owned plans and live global references in one personal catalog', async () => {
    const person = await login(false);
    const admin = await login(true);
    const global = await createGlobalPlan();
    const createOwned = await authenticatedMutation(
      person,
      person.post('/training-plans'),
    ).send({
      name: 'Meu plano',
      description: 'Plano editável pela pessoa.',
    });
    expect(createOwned.status).toBe(201);
    expect(createOwned.body).toMatchObject({
      data: { active: false, itemType: 'training-plan', source: 'owned' },
    });
    const ownedEntryId = (
      createOwned.body as { data: { catalogEntryId: string } }
    ).data.catalogEntryId;

    const reference = await authenticatedMutation(
      person,
      person.post('/training-plans/global-references'),
    ).send({ globalTrainingPlanId: global.id });
    expect(reference.status).toBe(201);
    expect(reference.body).toMatchObject({
      data: {
        active: false,
        id: global.id,
        itemType: 'training-plan',
        source: 'global-reference',
      },
    });
    const referenceEntryId = (
      reference.body as { data: { catalogEntryId: string } }
    ).data.catalogEntryId;

    const list = await person.get('/training-plans?page=1').expect(200);
    const listBody = list.body as { data: unknown[] };
    expect(list.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(listBody.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          catalogEntryId: ownedEntryId,
          source: 'owned',
        }),
        expect.objectContaining({
          catalogEntryId: referenceEntryId,
          source: 'global-reference',
        }),
      ]),
    );

    const readOnly = await authenticatedMutation(
      person,
      person
        .patch(`/training-plans/${referenceEntryId}`)
        .set('X-Resource-Version', '0'),
    ).send({ name: 'Não permitido' });
    expect(readOnly.body).toMatchObject({
      code: 'GLOBAL_TRAINING_PLAN_REFERENCE_READ_ONLY',
    });
    expect(readOnly.status).toBe(403);

    await authenticatedMutation(person, person.put('/training-plans/active'))
      .send({ active: true, catalogEntryId: ownedEntryId })
      .expect(200);
    const activeResponse = await authenticatedMutation(
      person,
      person.put('/training-plans/active'),
    )
      .send({ active: true, catalogEntryId: referenceEntryId })
      .expect(200);
    expect(activeResponse.body).toMatchObject({
      data: { activeCatalogEntryIds: [ownedEntryId, referenceEntryId] },
    });
    const activeList = await person.get('/training-plans?page=1').expect(200);
    expect(activeList.body).toMatchObject({ activeCount: 2 });
    const adminList = await admin
      .get('/global/training-plans?page=1')
      .expect(200);
    const adminListBody =
      adminList.body as GlobalTrainingPlanCollectionResponse;
    expect(adminListBody.data[0]).toMatchObject({
      usage: { activePeople: 1, linkedPeople: 1 },
    });

    await authenticatedMutation(
      admin,
      admin
        .delete(`/global/training-plans/${global.id}`)
        .set('X-Resource-Version', '0'),
    ).expect(204);
    const afterDelete = await person.get('/training-plans?page=1').expect(200);
    expect(afterDelete.body).toMatchObject({ total: 1 });
    const selection = await activeModel.findOne().lean().exec();
    expect(selection?.catalogEntryIds.map((id) => id.toString())).toEqual([
      ownedEntryId,
    ]);
  });

  it('rejects a sixth active plan without changing the confirmed five', async () => {
    const person = await login(false);
    const catalogEntryIds: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      const created = await authenticatedMutation(
        person,
        person.post('/training-plans'),
      ).send({
        description: 'Plano para validar o limite de seleções ativas.',
        name: `Plano ${index}`,
      });
      expect(created.status).toBe(201);
      catalogEntryIds.push(
        (created.body as { data: { catalogEntryId: string } }).data
          .catalogEntryId,
      );
    }
    for (const catalogEntryId of catalogEntryIds.slice(0, 5))
      await authenticatedMutation(person, person.put('/training-plans/active'))
        .send({ active: true, catalogEntryId })
        .expect(200);

    const rejected = await authenticatedMutation(
      person,
      person.put('/training-plans/active'),
    ).send({ active: true, catalogEntryId: catalogEntryIds[5] });
    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({
      code: 'ACTIVE_TRAINING_PLAN_LIMIT_REACHED',
      details: { limit: 5 },
    });
    const list = await person.get('/training-plans?page=1').expect(200);
    expect(list.body).toMatchObject({ activeCount: 5 });
  });

  it('migrates a legacy singular active selection without losing the plan', async () => {
    const person = await login(false);
    const created = await authenticatedMutation(
      person,
      person.post('/training-plans'),
    ).send({
      description: 'Plano preservado durante a migração da seleção ativa.',
      name: 'Plano legado',
    });
    expect(created.status).toBe(201);
    const catalogEntryId = (
      created.body as { data: { catalogEntryId: string } }
    ).data.catalogEntryId;
    const catalogEntry = await catalogModel
      .findById(catalogEntryId)
      .lean()
      .exec();
    expect(catalogEntry).not.toBeNull();
    if (catalogEntry === null) return;
    await activeModel.collection.insertOne({
      catalogEntryId: new Types.ObjectId(catalogEntryId),
      personId: catalogEntry.personId,
    });

    const list = await person.get('/training-plans?page=1').expect(200);
    expect(list.body).toMatchObject({
      activeCount: 1,
      data: [expect.objectContaining({ active: true, catalogEntryId })],
    });
    const migrated = await activeModel.collection.findOne({
      personId: catalogEntry.personId,
    });
    expect(migrated?.catalogEntryId).toBeUndefined();
    expect(migrated?.catalogEntryIds).toEqual([
      new Types.ObjectId(catalogEntryId),
    ]);
  });

  it('creates a workout in an owned personal plan through its catalog entry', async () => {
    const person = await login(false);
    const createOwned = await authenticatedMutation(
      person,
      person.post('/training-plans'),
    ).send({
      name: 'Meu plano com treino',
      description: 'Plano pessoal editável.',
    });
    expect(createOwned.status).toBe(201);
    const owned = createOwned.body as {
      data: { catalogEntryId: string; id: string; version: number };
    };

    const createWorkout = await authenticatedMutation(
      person,
      person
        .post(`/training-plans/${owned.data.catalogEntryId}/workouts`)
        .set('X-Resource-Version', String(owned.data.version)),
    ).send({});

    expect(createWorkout.status).toBe(201);
    expect(createWorkout.headers['x-resource-version']).toBe('1');
    expect(createWorkout.body).toMatchObject({
      data: { exerciseCount: 0, name: 'Novo treino' },
    });
    const persisted = await trainingPlanModel
      .findById(owned.data.id)
      .lean()
      .exec();
    expect(persisted?.workouts).toHaveLength(1);
  });

  it('persists an invisible clone job before scheduling and exposes only its blocked row', async () => {
    const person = await login(false);
    const global = await createGlobalPlan({
      workouts: [
        {
          _id: new Types.ObjectId(),
          name: 'Treino com imagem',
          exercises: [
            {
              _id: new Types.ObjectId(),
              bodyArea: 'chest',
              image: {
                display: {
                  height: 640,
                  key: 'source/display.webp',
                  width: 640,
                },
                thumbnail: {
                  height: 160,
                  key: 'source/thumbnail.webp',
                  width: 160,
                },
              },
              name: 'Supino',
              repetitions: 12,
              restSeconds: 60,
              sets: 3,
              type: 'image',
            },
          ],
        },
      ],
    });
    const start = await authenticatedMutation(
      person,
      person.post('/training-plan-clone-jobs'),
    ).send({ globalTrainingPlanId: global.id });
    expect(start.status).toBe(202);
    expect(start.body).toMatchObject({
      data: {
        completedImages: 0,
        itemType: 'clone-job',
        sourceName: global.name,
        state: 'queued',
        totalImages: 1,
      },
    });
    const cloneJobId = (start.body as { data: { cloneJobId: string } }).data
      .cloneJobId;
    expect(cloneStarter.start).toHaveBeenCalledWith({
      cloneJobId,
      generation: 1,
    });
    const persistedJob = await cloneJobModel.findById(cloneJobId).lean().exec();
    expect(persistedJob?.snapshot).toMatchObject({
      workouts: [
        {
          exercises: [
            {
              image: {
                display: { etag: 'etag:source/display.webp' },
                thumbnail: { etag: 'etag:source/thumbnail.webp' },
              },
            },
          ],
        },
      ],
    });
    await expect(
      trainingPlanModel.countDocuments({ ownerPersonId: { $ne: null } }),
    ).resolves.toBe(0);

    const list = await person.get('/training-plans?page=1').expect(200);
    expect(list.body).toMatchObject({
      data: [expect.objectContaining({ cloneJobId, itemType: 'clone-job' })],
      total: 1,
    });
    const library = await person
      .get('/training-plans/library?page=1')
      .expect(200);
    const libraryBody = library.body as GlobalTrainingPlanLibraryResponse;
    expect(libraryBody.data[0]).toMatchObject({ cloneBlocked: true });

    const cancel = await authenticatedMutation(
      person,
      person.delete(`/training-plan-clone-jobs/${cloneJobId}`),
    );
    expect(cancel.status).toBe(202);
    expect(cancel.body).toMatchObject({ data: { state: 'cancelling' } });
  });

  it('executes an active workout with optional integer load and persists its completion', async () => {
    const person = await login(false);
    const persistedPerson = await personModel
      .findOne({ googleSubject: 'google-person-001' })
      .lean()
      .exec();
    expect(persistedPerson).not.toBeNull();
    const workoutId = new Types.ObjectId();
    const exerciseId = new Types.ObjectId();
    const plan = await createGlobalPlan({
      name: 'Plano executável',
      workouts: [
        {
          _id: workoutId,
          name: 'Treino único',
          exercises: [
            {
              _id: exerciseId,
              bodyArea: 'chest',
              name: 'Supino sem carga',
              repetitions: 12,
              restSeconds: 60,
              sets: 2,
              type: 'youtube-short',
              youtubeId: 'ZA8gs8XP2bs',
            },
          ],
        },
      ],
    });
    const catalogEntry = await catalogModel.create({
      globalTrainingPlanId: plan._id,
      kind: 'global-reference',
      personId: persistedPerson?._id,
      trainingPlanId: null,
    });
    await activeModel.create({
      catalogEntryIds: [catalogEntry._id],
      personId: persistedPerson?._id,
    });

    const overview = await person.get('/training').expect(200);
    expect(overview.body).toMatchObject({
      data: {
        offlinePreparations: [
          {
            plan: { id: plan.id },
            workoutIds: [workoutId.toString()],
          },
        ],
        plan: { id: plan.id, source: 'global-reference' },
        workouts: [{ id: workoutId.toString(), indicator: 'current' }],
      },
    });
    const overviewData = (overview.body as TrainingOverviewResponse).data;
    const offlineValidity = overviewData.offlinePreparations[0]?.validity;
    expect(offlineValidity).toBeDefined();
    if (offlineValidity === undefined)
      throw new Error('Expected offline validity.');
    const validatedAt = Date.parse(offlineValidity.validatedAt);
    const expiresAt = Date.parse(offlineValidity.expiresAt);
    expect(expiresAt - validatedAt).toBe(7 * 24 * 60 * 60 * 1000);
    const preview = await person
      .get(`/training/workouts/${workoutId.toString()}`)
      .expect(200);
    expect(preview.body).toMatchObject({
      data: {
        exercises: [{ id: exerciseId.toString(), lastLoadsKg: [null, null] }],
      },
    });

    const started = await authenticatedMutation(
      person,
      person.post(`/training/workouts/${workoutId.toString()}/session`),
    )
      .send({})
      .expect(201);
    expect(started.headers['x-resource-version']).toBe('0');
    expect(started.body).toMatchObject({
      data: {
        exercises: [{ series: [{ loadKg: null }, { loadKg: null }] }],
        version: 0,
      },
    });

    const completedSeries = await authenticatedMutation(
      person,
      person
        .post(
          `/training/session/exercises/${exerciseId.toString()}/series/1/complete`,
        )
        .set('X-Resource-Version', '0'),
    )
      .send({ loadKg: null })
      .expect(201);
    expect(completedSeries.headers['x-resource-version']).toBe('1');

    const resolvedRest = await authenticatedMutation(
      person,
      person
        .post('/training/session/timer/resolve')
        .set('X-Resource-Version', '1'),
    )
      .send({ outcome: 'skip' })
      .expect(201);
    expect(resolvedRest.headers['x-resource-version']).toBe('2');

    const conflict = await authenticatedMutation(
      person,
      person
        .put(
          `/training/session/exercises/${exerciseId.toString()}/series/2/load`,
        )
        .set('X-Resource-Version', '1'),
    ).send({ loadKg: 19 });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      code: 'WORKOUT_SESSION_VERSION_CONFLICT',
    });

    const completedSecondSeries = await authenticatedMutation(
      person,
      person
        .post(
          `/training/session/exercises/${exerciseId.toString()}/series/2/complete`,
        )
        .set('X-Resource-Version', '2'),
    )
      .send({ loadKg: 17 })
      .expect(201);
    expect(completedSecondSeries.headers['x-resource-version']).toBe('3');

    const completed = await authenticatedMutation(
      person,
      person.post('/training/session/complete').set('X-Resource-Version', '3'),
    )
      .send({ confirmIncomplete: false, timezone: 'America/Sao_Paulo' })
      .expect(201);
    expect(completed.body).toMatchObject({
      data: {
        fullCompletion: true,
        totalLoadKg: 17,
        workoutId: workoutId.toString(),
      },
    });
    const executionId = (completed.body as { data: { id: string } }).data.id;
    const repeated = await authenticatedMutation(
      person,
      person.post('/training/session/complete').set('X-Resource-Version', '3'),
    )
      .send({ confirmIncomplete: false, timezone: 'America/Sao_Paulo' })
      .expect(201);
    expect(repeated.body).toMatchObject({ data: { id: executionId } });
    await person.get(`/training/completions/${executionId}`).expect(200);
    await expect(workoutExecutionModel.countDocuments()).resolves.toBe(1);
    const storedExecution = await workoutExecutionModel
      .findById(executionId)
      .lean()
      .exec();
    expect(storedExecution?.catalogEntryId.toString()).toBe(catalogEntry.id);
    await expect(loadProfileModel.countDocuments()).resolves.toBe(1);
    await person.get('/training/session').expect(404);

    await authenticatedMutation(
      person,
      person.post(`/training/workouts/${workoutId.toString()}/session`),
    )
      .send({})
      .expect(201);
    await redisClient.del(
      `dall-fit-training-e2e:test:workout-session:${persistedPerson?._id.toString()}`,
    );
    const expired = await person.get('/training/session').expect(410);
    expect(expired.body).toMatchObject({ code: 'WORKOUT_SESSION_EXPIRED' });

    await authenticatedMutation(
      person,
      person.post(`/training/workouts/${workoutId.toString()}/session`),
    )
      .send({})
      .expect(201);
    const admin = await login(true);
    await authenticatedMutation(
      admin,
      withResourceVersion(
        admin.delete(`/global/training-plans/${plan.id}`),
        plan.id,
        plan.version,
      ),
    ).expect(204);
    await authenticatedMutation(
      person,
      person
        .post(
          `/training/session/exercises/${exerciseId.toString()}/series/complete-remaining`,
        )
        .set('X-Resource-Version', '0'),
    )
      .send({ loadsKg: [22, 23] })
      .expect(201);
    await authenticatedMutation(
      person,
      person.post('/training/session/complete').set('X-Resource-Version', '1'),
    )
      .send({ confirmIncomplete: false, timezone: 'America/Sao_Paulo' })
      .expect(201);
    await expect(loadProfileModel.countDocuments()).resolves.toBe(0);
  });
});
