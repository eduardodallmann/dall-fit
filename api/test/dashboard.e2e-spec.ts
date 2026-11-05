import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { RedisMemoryServer } from 'redis-memory-server';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  AdminDashboardResponse,
  DashboardResponse,
} from '@dall-fit/types';

import { configureApplication } from '~/configure-application';
import { PersonDocument } from '~/person/repositories/person.schema';
import {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanCatalogDocument,
} from '~/training-plan/repositories/personal-training-plan.schema';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';
import { WorkoutExecutionDocument } from '~/training/repositories/workout-execution.schema';
import { TrainingClockService } from '~/training/services/training-clock.service';

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
const testBypassKey = 'e2e-dashboard-key-with-at-least-32-random-bytes';
const now = new Date('2026-03-08T16:00:00.000Z');

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryServer;
  let redisServer: RedisMemoryServer;
  let redisClient: Redis;
  let people: Model<PersonDocument>;
  let plans: Model<TrainingPlanDocument>;
  let catalog: Model<PersonalTrainingPlanCatalogDocument>;
  let active: Model<PersonalTrainingPlanActiveDocument>;
  let executions: Model<WorkoutExecutionDocument>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '8.0.12' },
    });
    redisServer = new RedisMemoryServer({ binary: { version: '8.8.1' } });
    await redisServer.start();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoServer.getUri('dall-fit-dashboard-e2e');
    process.env.REDIS_URL = `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`;
    process.env.REDIS_NAMESPACE = 'dall-fit-dashboard-e2e';
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

    const { AppModule } = await import('~/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TrainingClockService)
      .useValue({ now: () => now })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    people = app.get(getModelToken(PersonDocument.name));
    plans = app.get(getModelToken(TrainingPlanDocument.name));
    catalog = app.get(getModelToken(PersonalTrainingPlanCatalogDocument.name));
    active = app.get(getModelToken(PersonalTrainingPlanActiveDocument.name));
    executions = app.get(getModelToken(WorkoutExecutionDocument.name));
    await Promise.all([
      people.syncIndexes(),
      plans.syncIndexes(),
      catalog.syncIndexes(),
      active.syncIndexes(),
      executions.syncIndexes(),
    ]);
    redisClient = new Redis(process.env.REDIS_URL);
  });

  beforeEach(async () => {
    await resetTermsFixture(app);
    await Promise.all([
      people.deleteMany({}).exec(),
      plans.deleteMany({}).exec(),
      catalog.deleteMany({}).exec(),
      active.deleteMany({}).exec(),
      executions.deleteMany({}).exec(),
      redisClient.flushdb(),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await redisClient?.quit();
    await redisServer?.stop();
    await mongoServer?.stop();
  });

  async function login(subject: string, isAdmin = false) {
    const person = await people.create({
      email: `${subject}@example.test`,
      googleSubject: subject,
      isAdmin: isAdmin || undefined,
      name: isAdmin ? 'Admin Runner' : 'Regular Runner',
      photoUrl: null,
    });
    await seedAcceptedTerms(app, person._id.toString());
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        email: `${subject}@example.test`,
        googleSubject: subject,
        name: 'Ignored',
        photoUrl: null,
      })
      .expect(204);
    return { agent, person };
  }

  async function createPlanFor(personId: Types.ObjectId) {
    const workoutId = new Types.ObjectId();
    const plan = await plans.create({
      description: 'Plano global do cenário.',
      name: 'Plano global',
      ownerPersonId: null,
      workouts: [{ _id: workoutId, exercises: [], name: 'Treino A' }],
    });
    const entry = await catalog.create({
      globalTrainingPlanId: plan._id,
      kind: 'global-reference',
      personId,
      trainingPlanId: null,
    });
    await active.create({ catalogEntryIds: [entry._id], personId });
    return { entry, plan, workoutId };
  }

  async function createExecution(input: {
    completedAt: string;
    personId: Types.ObjectId;
    planId?: Types.ObjectId;
    workoutId?: Types.ObjectId;
  }) {
    const completedAt = new Date(input.completedAt);
    return executions.create({
      bodyAreas: ['chest'],
      catalogEntryId: new Types.ObjectId(),
      completedAt,
      completedExerciseCount: 1,
      durationSeconds: 1800,
      fullCompletion: true,
      personId: input.personId,
      planName: 'Plano capturado',
      sessionId: new Types.ObjectId().toString(),
      source: 'global-reference',
      startedAt: new Date(completedAt.getTime() - 1_800_000),
      status: 'completed',
      timezone: 'America/New_York',
      totalExerciseCount: 1,
      totalLoadKg: 20,
      trainingPlanId: input.planId ?? new Types.ObjectId(),
      workoutCount: 1,
      workoutId: input.workoutId ?? new Types.ObjectId(),
      workoutName: 'Treino capturado',
    });
  }

  it('isolates personal history and respects the civil week around DST', async () => {
    const { agent, person } = await login('person-dashboard');
    const other = await people.create({
      email: 'other@example.test',
      googleSubject: 'other-dashboard',
      name: 'Other Runner',
      photoUrl: null,
    });
    const { entry, plan, workoutId } = await createPlanFor(person._id);
    await Promise.all([
      createExecution({
        completedAt: '2026-03-02T05:00:00.000Z',
        personId: person._id,
        planId: plan._id,
        workoutId,
      }),
      createExecution({
        completedAt: '2026-03-09T03:59:59.000Z',
        personId: person._id,
        planId: plan._id,
        workoutId,
      }),
      createExecution({
        completedAt: '2026-03-05T12:00:00.000Z',
        personId: other._id,
      }),
    ]);

    const response = await agent
      .get('/dashboard?timezone=America%2FNew_York')
      .expect(200);
    const body = response.body as DashboardResponse;

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-request-id']).toBeTypeOf('string');
    expect(body.data.currentWeek).toMatchObject({
      completedWorkoutCount: 2,
      endDate: '2026-03-08',
      startDate: '2026-03-02',
    });
    expect(body.data.last30Days.completedWorkoutCount).toBe(2);
    expect(body.data.recentWorkouts).toHaveLength(2);
    expect(body.data.nextAction).toMatchObject({
      catalogEntryId: entry._id.toString(),
      type: 'start-workout',
      workoutId: workoutId.toString(),
    });
    expect(body.data.weeklyTrend).toHaveLength(8);
  });

  it('validates timezone and protects the administrative endpoint', async () => {
    const { agent } = await login('person-common');

    expect((await agent.get('/dashboard').expect(400)).body).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(
      (await agent.get('/dashboard?timezone=Mars%2FOlympus').expect(400)).body,
    ).toMatchObject({ code: 'DASHBOARD_TIMEZONE_INVALID' });
    expect(
      (await agent.get('/admin/dashboard?timezone=UTC').expect(403)).body,
    ).toMatchObject({ code: 'ADMIN_ACCESS_REQUIRED' });
    await request(app.getHttpServer())
      .get('/dashboard?timezone=UTC')
      .expect(401);
  });

  it('returns only aggregated administrative data and deterministic top plans', async () => {
    const { agent, person: admin } = await login('person-admin', true);
    const common = await people.create({
      email: 'common@example.test',
      googleSubject: 'person-common',
      name: 'Common Runner',
      photoUrl: null,
    });
    const adminPlan = await createPlanFor(admin._id);
    await catalog.create({
      globalTrainingPlanId: adminPlan.plan._id,
      kind: 'global-reference',
      personId: common._id,
      trainingPlanId: null,
    });
    await createExecution({
      completedAt: '2026-03-05T12:00:00.000Z',
      personId: common._id,
      planId: adminPlan.plan._id,
      workoutId: adminPlan.workoutId,
    });

    const response = await agent
      .get('/admin/dashboard?timezone=UTC')
      .expect(200);
    const body = response.body as AdminDashboardResponse;

    expect(body.data.people).toMatchObject({
      activePlanCount: 1,
      totalCount: 2,
      trainedLast30DaysCount: 1,
    });
    expect(body.data.training.completedWorkoutCount).toBe(1);
    expect(body.data.topGlobalPlans[0]).toEqual({
      activePeopleCount: 1,
      id: adminPlan.plan._id.toString(),
      linkedPeopleCount: 2,
      name: 'Plano global',
    });
    expect(JSON.stringify(body)).not.toContain('example.test');
    expect(JSON.stringify(body)).not.toContain('Runner');
  });
});
