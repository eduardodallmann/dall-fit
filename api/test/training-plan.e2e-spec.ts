import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  GlobalTrainingPlanCollectionResponse,
  TrainingPlanDetailsResponse,
} from '@dall-fit/types';

import { configureApplication } from '~/configure-application';
import { PersonDocument } from '~/person/repositories/person.schema';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';

const googleCredential = Buffer.from(
  JSON.stringify({
    web: {
      client_id: 'fake-client.apps.googleusercontent.com',
      client_secret: 'fake-client-secret',
      redirect_uris: ['http://localhost:4000/callback'],
    },
  }),
).toString('base64');

describe('Global training plans (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryServer;
  let personModel: Model<PersonDocument>;
  let trainingPlanModel: Model<TrainingPlanDocument>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '8.0.12' },
    });
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoServer.getUri('dall-fit-training-plan-e2e');
    process.env.GOOGLE_OAUTH_CREDENTIALS_BASE64 = googleCredential;
    process.env.AUTH_SESSION_SECRET = 'e2e-session-secret-with-32-characters';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_TEST_BYPASS_ENABLED = 'true';
    process.env.AUTH_TEST_BYPASS_KEY = 'local-auth-test-key';
    process.env.UI_URL = 'http://localhost:3000';

    const { AppModule } = await import('~/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    personModel = app.get<Model<PersonDocument>>(
      getModelToken(PersonDocument.name),
    );
    trainingPlanModel = app.get<Model<TrainingPlanDocument>>(
      getModelToken(TrainingPlanDocument.name),
    );
    await Promise.all([
      personModel.syncIndexes(),
      trainingPlanModel.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      personModel.deleteMany({}).exec(),
      trainingPlanModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await mongoServer?.stop();
  });

  async function login(
    isAdmin: boolean,
  ): Promise<ReturnType<typeof request.agent>> {
    const googleSubject = isAdmin ? 'google-admin-001' : 'google-person-001';
    await personModel.create({
      googleSubject,
      name: isAdmin ? 'Admin Runner' : 'Regular Runner',
      email: isAdmin
        ? 'admin.runner@example.test'
        : 'regular.runner@example.test',
      photoUrl: null,
      ...(isAdmin ? { isAdmin: true } : {}),
    });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', 'local-auth-test-key')
      .send({
        googleSubject,
        name: 'Ignored profile',
        email: 'ignored@example.test',
        photoUrl: null,
      })
      .expect(204);

    return agent;
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

  it('protects every operation with authentication and administrative authorization', async () => {
    const planId = new Types.ObjectId().toString();
    const workoutId = new Types.ObjectId().toString();
    const operations = [
      ['get', '/global/training-plans'],
      ['post', '/global/training-plans'],
      ['get', `/global/training-plans/${planId}`],
      ['patch', `/global/training-plans/${planId}`],
      ['delete', `/global/training-plans/${planId}`],
      ['post', `/global/training-plans/${planId}/workouts`],
      ['delete', `/global/training-plans/${planId}/workouts/${workoutId}`],
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
    const createResponse = await agent.post('/global/training-plans').send({
      name: '  Plano hipertrofia  ',
      description: '  Um plano global completo.  ',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      data: {
        name: 'Plano hipertrofia',
        description: 'Um plano global completo.',
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

    const updateResponse = await agent
      .patch(`/global/training-plans/${planId}`)
      .send({ name: '  Plano atualizado  ' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      data: {
        id: planId,
        name: 'Plano atualizado',
        description: 'Um plano global completo.',
      },
    });

    await agent.delete(`/global/training-plans/${planId}`).expect(204);
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
          exercises: [{ name: 'Agachamento' }, { name: 'Supino' }],
        },
      ],
    });

    const detailResponse = await agent.get(`/global/training-plans/${plan.id}`);
    const detailBody = detailResponse.body as TrainingPlanDetailsResponse;
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      data: {
        id: plan.id,
        workouts: [{ name: 'Treino A', exerciseCount: 2 }],
      },
    });
    expect(detailBody.data.workouts[0]).not.toHaveProperty('exercises');

    await agent.delete(`/global/training-plans/${plan.id}`).expect(204);
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
          exercises: [{ name: 'Remada' }],
        },
      ],
    });

    const createResponse = await agent
      .post(`/global/training-plans/${plan.id}/workouts`)
      .send({});
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

    await agent
      .delete(`/global/training-plans/${plan.id}/workouts/${workoutId}`)
      .expect(204);
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
      const patchResponse = await agent
        .patch(`/global/training-plans/${planId}`)
        .send({ name: 'Não atualiza' });
      const deleteResponse = await agent.delete(
        `/global/training-plans/${planId}`,
      );
      const workoutResponse = await agent
        .post(`/global/training-plans/${planId}/workouts`)
        .send({});

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

    const missingWorkoutResponse = await agent.delete(
      `/global/training-plans/${globalPlan.id}/workouts/${missingWorkoutId}`,
    );
    const missingPlanWorkoutResponse = await agent.delete(
      `/global/training-plans/${missingPlanId}/workouts/${missingWorkoutId}`,
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
      () => agent.get('/global/training-plans/not-an-id'),
      () =>
        agent
          .post('/global/training-plans')
          .send({ name: ' ', description: 'x' }),
      () =>
        agent.post('/global/training-plans').send({
          name: 'Plano',
          description: 'Descrição',
          unexpected: true,
        }),
      () => agent.patch(`/global/training-plans/${plan.id}`).send({}),
      () =>
        agent
          .post(`/global/training-plans/${plan.id}/workouts`)
          .send({ unexpected: true }),
    ];

    for (const makeRequest of invalidRequests) {
      const response = await makeRequest();
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'VALIDATION_ERROR',
        details: {},
        message: 'Request validation failed.',
      });
    }
  });

  it('creates the compound owner and creation index', async () => {
    const indexes = await trainingPlanModel.collection.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { ownerPersonId: 1, createdAt: -1 } }),
      ]),
    );
  });
});
