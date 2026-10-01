import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { RateLimitService } from '~/redis/rate-limit.service';
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
import { OfflineTrainingTerminalReceiptDocument } from '~/training/repositories/offline-training-terminal-receipt.schema';
import { WorkoutExecutionDocument } from '~/training/repositories/workout-execution.schema';
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

interface SnapshotResponseBody {
  data: {
    acceptedAt: string;
    completion?: { id: string };
    executionId: string;
    expiresAt?: string;
    orderedAt: string;
    revision: number;
    snapshotState: 'cancelled' | 'completed' | 'in-progress';
    state:
      | 'accepted'
      | 'cancelled'
      | 'completed'
      | 'duplicate'
      | 'duplicate-cancelled'
      | 'duplicate-completed'
      | 'resolved-local'
      | 'resolved-server';
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
  let receiptModel: Model<OfflineTrainingTerminalReceiptDocument>;
  let executionModel: Model<WorkoutExecutionDocument>;
  let authSessions: AuthSessionService;
  let leases: OfflineTrainingLeaseService;
  let configService: ConfigService;

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
    process.env.ANDROID_MIN_VERSION_CODE = '1';
    process.env.ANDROID_PLAY_STORE_URL =
      'https://play.google.com/store/apps/details?id=com.dallfit.app';
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
    configService = app.get(ConfigService);
    receiptModel = app.get(
      getModelToken(OfflineTrainingTerminalReceiptDocument.name),
    );
    executionModel = app.get(getModelToken(WorkoutExecutionDocument.name));
    redisClient = new Redis(process.env.REDIS_URL);
    await Promise.all([
      personModel.syncIndexes(),
      planModel.syncIndexes(),
      catalogModel.syncIndexes(),
      activeModel.syncIndexes(),
      receiptModel.syncIndexes(),
      executionModel.syncIndexes(),
    ]);
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    configService.set('ANDROID_MIN_VERSION_CODE', 1);
    await Promise.all([
      personModel.deleteMany({}).exec(),
      planModel.deleteMany({}).exec(),
      catalogModel.deleteMany({}).exec(),
      activeModel.deleteMany({}).exec(),
      receiptModel.deleteMany({}).exec(),
      executionModel.deleteMany({}).exec(),
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

  it('publishes the public Android compatibility policy without caching', async () => {
    const redisRateLimit = vi.spyOn(app.get(RateLimitService), 'consume');
    const response = await request(app.getHttpServer())
      .get('/app-compatibility/android')
      .expect(200);

    expect(redisRateLimit).not.toHaveBeenCalled();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toBeTypeOf('string');
    expect(response.body).toEqual({
      data: {
        minimumVersionCode: 1,
        platform: 'android',
        storeUrl:
          'https://play.google.com/store/apps/details?id=com.dallfit.app',
        syncContractVersion: 1,
      },
    });
  });

  it('rejects incompatible snapshot metadata before touching lease or snapshot state', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const leaseBefore = await redisClient.get(leaseKey());
    const leaseTtlBefore = await redisClient.pttl(leaseKey());
    configService.set('ANDROID_MIN_VERSION_CODE', 2);

    const cases = [
      {},
      { 'X-App-Version-Code': '1', 'X-Sync-Contract-Version': '1' },
      { 'X-App-Version-Code': '2', 'X-Sync-Contract-Version': '2' },
      { 'X-App-Version-Code': 'invalid', 'X-Sync-Contract-Version': '1' },
    ];
    for (const headers of cases) {
      const response = await request(app.getHttpServer())
        .put('/training/offline-snapshot')
        .set('Authorization', `Bearer ${token}`)
        .set(headers)
        .send(snapshotRequest(lease.data.leaseId))
        .expect(409);
      expect(response.body).toMatchObject({
        code: 'APP_UPDATE_REQUIRED',
        details: {
          minimumVersionCode: 2,
          storeUrl:
            'https://play.google.com/store/apps/details?id=com.dallfit.app',
          syncContractVersion: 1,
        },
      });
    }

    expect(await redisClient.get(leaseKey())).toBe(leaseBefore);
    expect(await redisClient.pttl(leaseKey())).toBeLessThanOrEqual(
      leaseTtlBefore,
    );
    expect(await redisClient.exists(snapshotKey())).toBe(0);
    expect(await receiptModel.countDocuments()).toBe(0);
    expect(await executionModel.countDocuments()).toBe(0);

    await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .set('X-App-Version-Code', '2')
      .set('X-Sync-Contract-Version', '1')
      .send(snapshotRequest(lease.data.leaseId))
      .expect(200);
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
      await activeModel.create({ catalogEntryIds: [firstEntryId], personId });
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

  function snapshotKey(): string {
    return `dall-fit-offline-lease-e2e:test:offline-training-snapshot:${personId.toString()}`;
  }

  function snapshotLockKey(installationId: string): string {
    return `dall-fit-offline-lease-e2e:test:offline-training-snapshot-lock:${installationId}`;
  }

  function snapshotRequest(leaseId: string, revision = 0) {
    return {
      clientUpdatedAt: '2026-09-14T12:05:00.000Z',
      executionId: '11111111-1111-4111-8111-111111111111',
      installationId: installationA,
      leaseId,
      payloadVersion: 1,
      revision,
      snapshot: {
        activeTimer: null,
        state: 'in-progress',
        plan: {
          catalogEntryId: firstEntryId.toString(),
          name: 'Captured plan before edit',
          planId: firstPlanId.toString(),
          source: 'owned',
          workouts: [
            {
              bodyAreas: ['chest'],
              id: '64b000000000000000000843',
              name: 'Captured workout',
            },
          ],
        },
        startedAt: '2026-09-14T12:00:00.000Z',
        workout: {
          exercises: [
            {
              bodyArea: 'chest',
              completedAt: null,
              id: '64b000000000000000000844',
              name: 'Captured exercise',
              repetitions: 10,
              restSeconds: 60,
              series: [
                {
                  completedAt: null,
                  loadKg: null as number | null,
                  number: 1,
                  repetitions: 10,
                },
              ],
              sets: 1,
              type: 'youtube-short',
              youtubeId: 'ZA8gs8XP2bs',
            },
          ],
          id: '64b000000000000000000843',
          name: 'Captured workout',
        },
      },
    };
  }

  async function registeredLease(token: string): Promise<LeaseResponseBody> {
    const response = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    return response.body as LeaseResponseBody;
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

  it('keeps the installation lease when the active plan collection changes', async () => {
    await seedPlans();
    const token = await nativeToken();
    const first = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    await activeModel.updateOne(
      { personId },
      { $addToSet: { catalogEntryIds: secondEntryId } },
    );

    const rebound = await request(app.getHttpServer())
      .put('/training/offline-lease')
      .set('Authorization', `Bearer ${token}`)
      .send({ installationId: installationA })
      .expect(200);
    const firstBody = first.body as LeaseResponseBody;
    const reboundBody = rebound.body as LeaseResponseBody;

    expect(reboundBody.data.state).toBe('unchanged');
    expect(reboundBody.data.leaseId).toBe(firstBody.data.leaseId);
    await expect(
      leases.validate({
        installationId: installationA,
        leaseId: firstBody.data.leaseId,
        personId: personId.toString(),
      }),
    ).resolves.toMatchObject({ leaseId: firstBody.data.leaseId });
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

  it('accepts a historical snapshot atomically and an identical replay preserves values and TTLs', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    await redisClient.pexpire(leaseKey(), 10_000);
    await planModel.updateOne(
      { _id: firstPlanId },
      { $set: { name: 'Current edited plan', workouts: [] } },
    );
    const body = snapshotRequest(lease.data.leaseId);
    const accepted = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    const acceptedBody = accepted.body as SnapshotResponseBody;
    const snapshotBefore = await redisClient.hgetall(snapshotKey());
    const snapshotTtlBefore = await redisClient.pttl(snapshotKey());
    const leaseTtlBefore = await redisClient.pttl(leaseKey());
    await new Promise((resolve) => setTimeout(resolve, 20));
    const replay = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    const replayBody = replay.body as SnapshotResponseBody;

    expect(accepted.headers['cache-control']).toBe('private, no-store');
    expect(acceptedBody.data.state).toBe('accepted');
    expect(replayBody.data).toEqual({
      ...acceptedBody.data,
      state: 'duplicate',
    });
    expect(await redisClient.hgetall(snapshotKey())).toEqual(snapshotBefore);
    expect(await redisClient.pttl(snapshotKey())).toBeLessThan(
      snapshotTtlBefore,
    );
    expect(await redisClient.pttl(leaseKey())).toBeLessThan(leaseTtlBefore);
    expect(snapshotTtlBefore).toBeGreaterThan(604_790_000);
    expect(Math.abs(snapshotTtlBefore - leaseTtlBefore)).toBeLessThan(10);
    expect(await planModel.findById(firstPlanId).lean().exec()).toMatchObject({
      name: 'Current edited plan',
      workouts: [],
    });
  });

  it('advances only larger revisions and orders equal or regressive client clocks monotonically', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const initial = snapshotRequest(lease.data.leaseId);
    const first = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(initial)
      .expect(200);
    const equalClock = {
      ...snapshotRequest(lease.data.leaseId, 1),
      snapshot: {
        ...initial.snapshot,
        workout: { ...initial.snapshot.workout, name: 'Captured workout' },
      },
    };
    const second = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(equalClock)
      .expect(200);
    const regressive = {
      ...snapshotRequest(lease.data.leaseId, 2),
      clientUpdatedAt: '2026-09-14T12:04:00.000Z',
    };
    const third = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(regressive)
      .expect(200);
    const firstBody = first.body as SnapshotResponseBody;
    const secondBody = second.body as SnapshotResponseBody;
    const thirdBody = third.body as SnapshotResponseBody;
    expect(Date.parse(secondBody.data.orderedAt)).toBeGreaterThan(
      Date.parse(firstBody.data.orderedAt),
    );
    expect(Date.parse(thirdBody.data.orderedAt)).toBeGreaterThan(
      Date.parse(secondBody.data.orderedAt),
    );
    expect(await redisClient.hget(snapshotKey(), 'clientUpdatedAt')).toBe(
      regressive.clientUpdatedAt,
    );

    const stale = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(snapshotRequest(lease.data.leaseId, 1))
      .expect(409);
    expect(stale.body).toMatchObject({
      code: 'OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT',
      details: { allowedResolution: 'local-or-server' },
    });
    expect(await redisClient.hget(snapshotKey(), 'revision')).toBe('2');
  });

  it('distinguishes idempotency and current-execution conflicts without changing the snapshot', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const body = snapshotRequest(lease.data.leaseId);
    await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    const before = await redisClient.hgetall(snapshotKey());
    const collision = structuredClone(body);
    collision.snapshot.workout.exercises[0].series[0].loadKg = 10;
    const collisionResponse = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(collision)
      .expect(409);
    expect(collisionResponse.body).toMatchObject({
      code: 'OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT',
      details: { allowedResolution: 'local-or-server' },
    });
    const otherExecution = {
      ...body,
      executionId: '44444444-4444-4444-8444-444444444444',
    };
    const executionResponse = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(otherExecution)
      .expect(409);
    expect(executionResponse.body).toMatchObject({
      code: 'OFFLINE_TRAINING_SNAPSHOT_VERSION_CONFLICT',
      details: { allowedResolution: 'local-or-server' },
    });
    expect(await redisClient.hgetall(snapshotKey())).toEqual(before);
  });

  it('resolves a comparable conflict by complete local or server version', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const body = snapshotRequest(lease.data.leaseId);
    await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    const local = structuredClone(body);
    local.snapshot.workout.exercises[0].series[0].loadKg = 10;
    const conflict = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(local)
      .expect(409);
    const conflictToken = (
      conflict.body as {
        details: { conflictToken: string };
      }
    ).details.conflictToken;
    const keepServer = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...local,
        resolution: { choice: 'server', conflictToken },
      })
      .expect(200);
    expect(keepServer.body).toMatchObject({
      data: { snapshotState: 'in-progress', state: 'resolved-server' },
    });
    const replace = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...local,
        resolution: { choice: 'local', conflictToken },
      })
      .expect(200);
    expect(replace.body).toMatchObject({
      data: { snapshotState: 'in-progress', state: 'resolved-local' },
    });
    expect(await redisClient.hget(snapshotKey(), 'snapshot')).toContain(
      '"loadKg":10',
    );
  });

  it('completes once, returns the canonical summary and recognizes replay', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const body = snapshotRequest(lease.data.leaseId, 1);
    body.snapshot.state = 'completed';
    const completedSnapshot = body.snapshot as unknown as {
      completedAt: string;
      state: string;
      timezone: string;
      workout: {
        exercises: Array<{
          completedAt: string | null;
          series: Array<{
            completedAt: string | null;
            loadKg: number | null;
          }>;
        }>;
      };
    };
    completedSnapshot.completedAt = '2026-09-14T12:06:00.000Z';
    completedSnapshot.timezone = 'America/Sao_Paulo';
    completedSnapshot.workout.exercises[0].completedAt =
      '2026-09-14T12:05:00.000Z';
    completedSnapshot.workout.exercises[0].series[0].completedAt =
      '2026-09-14T12:04:00.000Z';
    completedSnapshot.workout.exercises[0].series[0].loadKg = 20;
    const first = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    const firstBody = first.body as SnapshotResponseBody;
    expect(first.body).toMatchObject({
      data: {
        completion: {
          completedExerciseCount: 1,
          durationSeconds: 360,
          totalLoadKg: 20,
        },
        snapshotState: 'completed',
        state: 'completed',
      },
    });
    expect(await executionModel.countDocuments()).toBe(1);
    expect(await receiptModel.countDocuments()).toBe(1);
    expect(await redisClient.exists(snapshotKey())).toBe(0);

    const replay = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);
    expect(replay.body).toMatchObject({
      data: {
        completion: { id: firstBody.data.completion?.id },
        state: 'duplicate-completed',
      },
    });
    expect(await executionModel.countDocuments()).toBe(1);
    expect(await receiptModel.countDocuments()).toBe(1);
  });

  it('cancels without history and allows the next execution', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const cancelled = snapshotRequest(lease.data.leaseId);
    cancelled.snapshot.state = 'cancelled';
    const cancelledSnapshot =
      cancelled.snapshot as typeof cancelled.snapshot & {
        cancelledAt: string;
      };
    cancelledSnapshot.cancelledAt = '2026-09-14T12:06:00.000Z';
    const response = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(cancelled)
      .expect(200);
    expect(response.body).toMatchObject({
      data: { snapshotState: 'cancelled', state: 'cancelled' },
    });
    expect(await executionModel.countDocuments()).toBe(0);
    expect(await receiptModel.countDocuments()).toBe(1);
    expect(await redisClient.exists(snapshotKey())).toBe(0);

    const next = snapshotRequest(lease.data.leaseId);
    next.executionId = '55555555-5555-4555-8555-555555555555';
    await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(next)
      .expect(200);
    expect(await redisClient.hget(snapshotKey(), 'executionId')).toBe(
      next.executionId,
    );
  });

  it('rejects invalid trees, revoked leases, occupied locks and non-native transports before writes', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const invalid = snapshotRequest(lease.data.leaseId);
    invalid.snapshot.workout.id = '64b000000000000000000999';
    await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(invalid)
      .expect(400);
    expect(await redisClient.exists(snapshotKey())).toBe(0);

    const revoked = snapshotRequest('44444444-4444-4444-8444-444444444444');
    const revokedResponse = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(revoked)
      .expect(409);
    expect(revokedResponse.body).toMatchObject({
      code: 'OFFLINE_LEASE_REVOKED',
    });

    await redisClient.set(
      snapshotLockKey(installationA),
      'other-token',
      'PX',
      15_000,
    );
    const contended = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(snapshotRequest(lease.data.leaseId))
      .expect(409);
    expect(contended.body).toMatchObject({
      code: 'OFFLINE_TRAINING_SYNC_IN_PROGRESS',
    });
    await redisClient.del(snapshotLockKey(installationA));

    const cookie = await webCookie();
    await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Cookie', cookie)
      .send(snapshotRequest(lease.data.leaseId))
      .expect(403);
    const ambiguous = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Cookie', cookie)
      .set('Authorization', `Bearer ${token}`)
      .send(snapshotRequest(lease.data.leaseId))
      .expect(400);
    expect(ambiguous.body).toMatchObject({ code: 'AUTH_TRANSPORT_AMBIGUOUS' });
  });

  it('returns the specific expiration and size errors without a snapshot write', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    await redisClient.del(leaseKey());
    const expired = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(snapshotRequest(lease.data.leaseId))
      .expect(410);
    expect(expired.body).toMatchObject({ code: 'OFFLINE_LEASE_EXPIRED' });
    const oversized = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send({ extra: 'x'.repeat(1024 * 1024) })
      .expect(413);
    expect(oversized.body).toMatchObject({
      code: 'OFFLINE_TRAINING_SNAPSHOT_TOO_LARGE',
    });
    expect(await redisClient.exists(snapshotKey())).toBe(0);
    expect(await redisClient.exists(snapshotLockKey(installationA))).toBe(0);
  });

  it('allows only one concurrent request into the installation critical region', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    const redisService = app.get(RedisClientService);
    const internalClient = Reflect.get(redisService, 'client') as Redis;
    const originalEval = internalClient.eval.bind(internalClient);
    vi.spyOn(internalClient, 'eval').mockImplementation(
      (...arguments_: Parameters<Redis['eval']>) => {
        const script = String(arguments_[0]);
        if (script.includes("redis.call('HSET', KEYS[2]")) {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              originalEval(...arguments_).then(resolve, reject);
            }, 40);
          });
        }
        return originalEval(...arguments_);
      },
    );
    const responses = await Promise.all([
      request(app.getHttpServer())
        .put('/training/offline-snapshot')
        .set('Authorization', `Bearer ${token}`)
        .send(snapshotRequest(lease.data.leaseId)),
      request(app.getHttpServer())
        .put('/training/offline-snapshot')
        .set('Authorization', `Bearer ${token}`)
        .send(snapshotRequest(lease.data.leaseId, 1)),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(responses.find(({ status }) => status === 409)?.body).toMatchObject({
      code: 'OFFLINE_TRAINING_SYNC_IN_PROGRESS',
    });
    expect(await redisClient.exists(snapshotLockKey(installationA))).toBe(0);
  });

  it('maps an isolated snapshot Redis failure without writing or renewing the lease', async () => {
    await seedPlans();
    const token = await nativeToken();
    const lease = await registeredLease(token);
    await redisClient.pexpire(leaseKey(), 10_000);
    const leaseBefore = await redisClient.get(leaseKey());
    const ttlBefore = await redisClient.pttl(leaseKey());
    const redisService = app.get(RedisClientService);
    const internalClient = Reflect.get(redisService, 'client') as Redis;
    const originalEval = internalClient.eval.bind(internalClient);
    vi.spyOn(internalClient, 'eval').mockImplementation(
      (...arguments_: Parameters<Redis['eval']>) => {
        if (String(arguments_[0]).includes("redis.call('HSET', KEYS[2]")) {
          return Promise.reject(new Error('isolated snapshot failure'));
        }
        return originalEval(...arguments_);
      },
    );
    const response = await request(app.getHttpServer())
      .put('/training/offline-snapshot')
      .set('Authorization', `Bearer ${token}`)
      .send(snapshotRequest(lease.data.leaseId))
      .expect(503);
    expect(response.body).toMatchObject({
      code: 'OFFLINE_TRAINING_SNAPSHOT_UNAVAILABLE',
    });
    expect(await redisClient.exists(snapshotKey())).toBe(0);
    expect(await redisClient.get(leaseKey())).toBe(leaseBefore);
    expect(await redisClient.pttl(leaseKey())).toBeLessThan(ttlBefore);
    expect(await redisClient.exists(snapshotLockKey(installationA))).toBe(0);
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
