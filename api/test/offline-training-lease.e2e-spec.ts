import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types, type Model } from 'mongoose';
import { RedisMemoryServer } from 'redis-memory-server';
import request from 'supertest';
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

import { AuthSessionService } from '~/auth/services/auth-session.service';
import { configureApplication } from '~/configure-application';
import { PersonDocument } from '~/person/repositories/person.schema';
import { RedisClientService } from '~/redis/redis-client.service';
import {
  PersonalTrainingPlanActiveDocument,
  PersonalTrainingPlanCatalogDocument,
} from '~/training-plan/repositories/personal-training-plan.schema';
import { TrainingPlanDocument } from '~/training-plan/repositories/training-plan.schema';
import type { OfflineTrainingLeaseIdentity } from '~/training/domain/offline-training-lease.types';
import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
} from '~/training/errors/offline-training-lease.errors';
import { OfflineTrainingLeaseService } from '~/training/services/offline-training-lease.service';

const googleCredential = Buffer.from(
  JSON.stringify({
    web: {
      client_id: 'fake-client.apps.googleusercontent.com',
      client_secret: 'fake-client-secret',
      redirect_uris: ['http://localhost:4000/callback'],
    },
  }),
).toString('base64');

const personId = new Types.ObjectId('64b000000000000000000084');
const firstPlanId = new Types.ObjectId('64b000000000000000000841');
const secondPlanId = new Types.ObjectId('64b000000000000000000842');
const firstEntryId = new Types.ObjectId('74b000000000000000000841');
const secondEntryId = new Types.ObjectId('74b000000000000000000842');
const installationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const installationB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface LeaseResponseBody {
  data: {
    expiresAt: string;
    leaseId: string;
    planId: string;
    state: string;
  };
}

describe('Offline training lease (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryServer;
  let redisServer: RedisMemoryServer;
  let redisClient: Redis;
  let personModel: Model<PersonDocument>;
  let planModel: Model<TrainingPlanDocument>;
  let catalogModel: Model<PersonalTrainingPlanCatalogDocument>;
  let activeModel: Model<PersonalTrainingPlanActiveDocument>;
  let authSessions: AuthSessionService;
  let leases: OfflineTrainingLeaseService;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '8.0.12' },
    });
    redisServer = new RedisMemoryServer({ binary: { version: '8.8.1' } });
    await redisServer.start();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoServer.getUri('dall-fit-offline-lease-e2e');
    process.env.REDIS_URL = `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`;
    process.env.REDIS_NAMESPACE = 'dall-fit-offline-lease-e2e';
    process.env.GOOGLE_OAUTH_CREDENTIALS_BASE64 = googleCredential;
    process.env.AUTH_SESSION_SECRET = 'e2e-session-secret-with-32-characters';
    process.env.AUTH_NATIVE_SESSION_AUDIENCE = 'dall-fit-android-e2e';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.UI_URL = 'http://localhost:3000';

    const { AppModule } = await import('~/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    personModel = app.get(getModelToken(PersonDocument.name));
    planModel = app.get(getModelToken(TrainingPlanDocument.name));
    catalogModel = app.get(
      getModelToken(PersonalTrainingPlanCatalogDocument.name),
    );
    activeModel = app.get(
      getModelToken(PersonalTrainingPlanActiveDocument.name),
    );
    authSessions = app.get(AuthSessionService);
    leases = app.get(OfflineTrainingLeaseService);
    redisClient = new Redis(process.env.REDIS_URL);
    await Promise.all([
      personModel.syncIndexes(),
      planModel.syncIndexes(),
      catalogModel.syncIndexes(),
      activeModel.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      personModel.deleteMany({}).exec(),
      planModel.deleteMany({}).exec(),
      catalogModel.deleteMany({}).exec(),
      activeModel.deleteMany({}).exec(),
      redisClient.flushdb(),
    ]);
    await personModel.create({
      _id: personId,
      email: 'offline.runner@example.test',
      googleSubject: 'google-offline-lease-001',
      name: 'Offline Runner',
      photoUrl: null,
    });
  });

  afterAll(async () => {
    await app?.close();
    await redisClient?.quit();
    await redisServer?.stop();
    await mongoServer?.stop();
  });

  async function seedPlans(active = true): Promise<void> {
    await planModel.create([
      {
        _id: firstPlanId,
        description: 'First offline plan.',
        name: 'First plan',
        ownerPersonId: personId,
        workouts: [],
      },
      {
        _id: secondPlanId,
        description: 'Second offline plan.',
        name: 'Second plan',
        ownerPersonId: personId,
        workouts: [],
      },
    ]);
    await catalogModel.create([
      {
        _id: firstEntryId,
        globalTrainingPlanId: null,
        kind: 'owned',
        personId,
        trainingPlanId: firstPlanId,
      },
      {
        _id: secondEntryId,
        globalTrainingPlanId: null,
        kind: 'owned',
        personId,
        trainingPlanId: secondPlanId,
      },
    ]);
    if (active) {
      await activeModel.create({ catalogEntryId: firstEntryId, personId });
    }
  }

  async function nativeToken(): Promise<string> {
    const session = await authSessions.createSession(
      personId.toString(),
      'native',
    );
    return session.token;
  }

  async function webCookie(): Promise<string> {
    const session = await authSessions.createSession(
      personId.toString(),
      'web',
    );
    return `dall_fit_session=${session.token}`;
  }

  function leaseKey(): string {
    return `dall-fit-offline-lease-e2e:test:offline-training-lease:${personId.toString()}`;
  }

  it('creates once and preserves the fence, expiry and PTTL on repeated registration', async () => {
    await seedPlans();
    const token = await nativeToken();
    const first = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    const firstBody = first.body as LeaseResponseBody;
    const firstPttl = await redisClient.pttl(leaseKey());
    await new Promise((resolve) => setTimeout(resolve, 20));
    const repeated = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    const repeatedBody = repeated.body as LeaseResponseBody;
    const repeatedPttl = await redisClient.pttl(leaseKey());

    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(firstBody.data.state).toBe('created');
    expect(repeatedBody.data).toEqual({
      ...firstBody.data,
      state: 'unchanged',
    });
    expect(firstPttl).toBeGreaterThan(604_790_000);
    expect(repeatedPttl).toBeLessThan(firstPttl);
    expect(JSON.stringify(repeated.body)).not.toContain(installationA);
  });

  it('rebinds the same installation to a newly active plan with a new fence', async () => {
    await seedPlans();
    const token = await nativeToken();
    const first = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    await activeModel.updateOne(
      { personId },
      { $set: { catalogEntryId: secondEntryId } },
    );

    const rebound = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    const firstBody = first.body as LeaseResponseBody;
    const reboundBody = rebound.body as LeaseResponseBody;

    expect(reboundBody.data.state).toBe('plan-rebound');
    expect(reboundBody.data.planId).toBe(secondPlanId.toString());
    expect(reboundBody.data.leaseId).not.toBe(firstBody.data.leaseId);
    await expect(
      leases.validate({
        installationId: installationA,
        leaseId: firstBody.data.leaseId,
        personId: personId.toString(),
        planId: firstPlanId.toString(),
      }),
    ).rejects.toBeInstanceOf(OfflineTrainingLeaseRevokedError);
  });

  it('requires takeover for another installation and makes takeover retry idempotent', async () => {
    await seedPlans();
    const token = await nativeToken();
    await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    const before = await redisClient.get(leaseKey());
    const beforePttl = await redisClient.pttl(leaseKey());
    const rejected = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationB })
      .expect(409);
    expect(rejected.body).toMatchObject({
      code: 'OFFLINE_LEASE_TAKEOVER_REQUIRED',
      details: {},
    });
    expect(JSON.stringify(rejected.body)).not.toContain(installationA);
    expect(await redisClient.get(leaseKey())).toBe(before);
    expect(await redisClient.pttl(leaseKey())).toBeLessThanOrEqual(beforePttl);

    const takeover = await request(app.getHttpServer())
      .post('/training/offline-lease/takeover')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationB })
      .expect(200);
    const retry = await request(app.getHttpServer())
      .post('/training/offline-lease/takeover')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationB })
      .expect(200);
    const takeoverBody = takeover.body as LeaseResponseBody;
    const retryBody = retry.body as LeaseResponseBody;
    expect(takeoverBody.data.state).toBe('taken-over');
    expect(retryBody.data).toEqual({
      ...takeoverBody.data,
      state: 'unchanged',
    });
  });

  it('linearizes concurrent registrations so exactly one installation wins', async () => {
    await seedPlans();
    const token = await nativeToken();

    const responses = await Promise.all([
      request(app.getHttpServer())
        .put('/training/offline-lease')
        .set('Authorization', `Bearer ${token}`)
        .send({ installationId: installationA }),
      request(app.getHttpServer())
        .put('/training/offline-lease')
        .set('Authorization', `Bearer ${token}`)
        .send({ installationId: installationB }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      responses.filter(
        (response) =>
          (response.body as LeaseResponseBody).data?.state === 'created',
      ),
    ).toHaveLength(1);
    expect(await redisClient.get(leaseKey())).not.toBeNull();
  });

  it('distinguishes expiry from revocation and only accepted sync renews the TTL', async () => {
    await seedPlans();
    const token = await nativeToken();
    const created = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    const body = created.body as LeaseResponseBody;
    const identity: OfflineTrainingLeaseIdentity = {
      installationId: installationA,
      leaseId: body.data.leaseId,
      personId: personId.toString(),
      planId: firstPlanId.toString(),
    };
    await redisClient.pexpire(leaseKey(), 10_000);
    const beforeValidation = await redisClient.pttl(leaseKey());
    await expect(leases.validate(identity)).resolves.toMatchObject(identity);
    const afterValidation = await redisClient.pttl(leaseKey());
    expect(afterValidation).toBeLessThanOrEqual(beforeValidation);

    const renewed = await leases.renewAfterAcceptedSync(identity);
    expect(renewed.expiresAt).not.toBe(body.data.expiresAt);
    expect(await redisClient.pttl(leaseKey())).toBeGreaterThan(604_790_000);

    await redisClient.pexpire(leaseKey(), 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(leases.validate(identity)).rejects.toBeInstanceOf(
      OfflineTrainingLeaseExpiredError,
    );
    const recreated = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    expect((recreated.body as LeaseResponseBody).data.leaseId).not.toBe(
      identity.leaseId,
    );
    await expect(leases.validate(identity)).rejects.toBeInstanceOf(
      OfflineTrainingLeaseRevokedError,
    );
  });

  it('rejects invalid bodies, web sessions and missing active plans before the lease write', async () => {
    await seedPlans(false);
    const token = await nativeToken();
    const invalid = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: 'not-v4', personId: personId.toString() })
      .expect(400);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await redisClient.get(leaseKey())).toBeNull();
    const additionalField = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({
        installationId: installationA,
        personId: personId.toString(),
      })
      .expect(400);
    expect(additionalField.body).toMatchObject({ code: 'VALIDATION_ERROR' });

    const missing = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(404);
    expect(missing.body).toMatchObject({
      code: 'ACTIVE_TRAINING_PLAN_NOT_FOUND',
    });
    expect(await redisClient.get(leaseKey())).toBeNull();

    const cookie = await webCookie();
    const web = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Cookie', cookie)
      .send({ installationId: installationA })
      .expect(403);
    expect(web.body).toMatchObject({ code: 'NATIVE_SESSION_REQUIRED' });
  });

  it('returns lease-specific 503 when the Redis lease transition fails', async () => {
    await seedPlans();
    const token = await nativeToken();
    const redisService = app.get(RedisClientService);
    const internalClient = Reflect.get(redisService, 'client') as Redis;
    const originalEval = internalClient.eval.bind(internalClient);
    vi.spyOn(internalClient, 'eval').mockImplementation(
      (...arguments_: Parameters<Redis['eval']>) => {
        const script = String(arguments_[0]);
        if (script.includes('takeover-required')) {
          return Promise.reject(new Error('isolated lease failure'));
        }
        return originalEval(...arguments_);
      },
    );

    const response = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(503);

    expect(response.body).toMatchObject({ code: 'OFFLINE_LEASE_UNAVAILABLE' });
    expect(await redisClient.get(leaseKey())).toBeNull();
  });
});
