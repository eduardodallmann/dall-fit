import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
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

import {
  AUTH_SESSION_COOKIE,
  OAUTH_CODE_VERIFIER_COOKIE,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '~/auth/auth.constants';
import { InvalidGoogleIdentityError } from '~/auth/errors/invalid-google-identity.error';
import { GoogleOAuthService } from '~/auth/services/google-oauth.service';
import { configureApplication } from '~/configure-application';
import { PersonDocument } from '~/person/repositories/person.schema';

const googleCredential = Buffer.from(
  JSON.stringify({
    web: {
      client_id: 'fake-client.apps.googleusercontent.com',
      client_secret: 'fake-client-secret',
      redirect_uris: ['http://localhost:4000/callback'],
    },
  }),
).toString('base64');
const testBypassKey = 'e2e-auth-test-key-with-at-least-32-random-bytes';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryServer;
  let personModel: Model<PersonDocument>;
  let redisClient: Redis;
  let redisServer: RedisMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '8.0.12' },
    });
    redisServer = new RedisMemoryServer({ binary: { version: '8.8.1' } });
    await redisServer.start();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoServer.getUri('dall-fit-e2e');
    process.env.REDIS_URL = `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`;
    process.env.REDIS_NAMESPACE = 'dall-fit-auth-e2e';
    process.env.GOOGLE_OAUTH_CREDENTIALS_BASE64 = googleCredential;
    process.env.AUTH_SESSION_SECRET = 'e2e-session-secret-with-32-characters';
    process.env.AUTH_NATIVE_SESSION_AUDIENCE = 'dall-fit-android-e2e';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_TEST_BYPASS_ENABLED = 'true';
    process.env.AUTH_TEST_BYPASS_E2E_ENABLED = 'true';
    process.env.AUTH_TEST_BYPASS_KEY = testBypassKey;
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
    await personModel.syncIndexes();
    redisClient = new Redis(process.env.REDIS_URL);
  });

  beforeEach(async () => {
    await Promise.all([
      personModel.deleteMany({}).exec(),
      redisClient.flushdb(),
    ]);
  });

  async function getCsrfToken(
    agent: ReturnType<typeof request.agent>,
  ): Promise<string> {
    const response = await agent.get('/auth/csrf').expect(200);
    const body = response.body as { data: { token: string } };

    return body.data.token;
  }

  async function createNativeSession(
    googleSubject: string,
  ): Promise<{ accessToken: string }> {
    const googleOAuthService = app.get(GoogleOAuthService);
    const verifySpy = vi
      .spyOn(googleOAuthService, 'verifyNativeIdentityToken')
      .mockResolvedValueOnce({
        email: `${googleSubject}@example.test`,
        googleSubject,
        name: 'Native Runner',
        photoUrl: null,
      });
    const response = await request(app.getHttpServer())
      .post('/auth/native/session')
      .send({ identityToken: 'safe-e2e-google-token' });
    verifySpy.mockRestore();
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    const body = response.body as {
      data: { accessToken: string; tokenType: string };
    };
    expect(body.data.tokenType).toBe('Bearer');
    return { accessToken: body.data.accessToken };
  }

  it('returns the removed root as a public normalized 404', async () => {
    const rootResponse = await request(app.getHttpServer()).get('/');

    expect(rootResponse.status).toBe(404);
    expect(rootResponse.body).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      details: {},
      message: 'The requested resource was not found.',
      requestId: rootResponse.headers['x-request-id'],
    });
  });

  it('rejects protected endpoints without a session', async () => {
    const meResponse = await request(app.getHttpServer()).get('/auth/me');
    const configsResponse = await request(app.getHttpServer())
      .patch('/auth/me/configs')
      .send({ theme: 'dark' });

    expect(meResponse.status).toBe(401);
    expect(meResponse.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
    expect(configsResponse.status).toBe(401);
    expect(configsResponse.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('creates a person and uses the real session cookie on protected endpoints', async () => {
    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-new-001',
        name: 'Alex Runner',
        email: 'alex.runner@example.test',
        photoUrl: 'https://example.test/alex.png',
      });
    const meResponse = await agent.get('/auth/me');

    expect(loginResponse.status).toBe(204);
    expect(loginResponse.headers['set-cookie']?.[0]).toContain(
      `${AUTH_SESSION_COOKIE}=`,
    );
    expect(loginResponse.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(loginResponse.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toMatchObject({
      data: {
        configs: {},
        name: 'Alex Runner',
        email: 'alex.runner@example.test',
        photoUrl: 'https://example.test/alex.png',
      },
    });
    const meBody = meResponse.body as { data: Record<string, unknown> };
    expect(meBody.data).not.toHaveProperty('googleSubject');
    expect(meBody.data).not.toHaveProperty('isAdmin');
    await expect(personModel.countDocuments()).resolves.toBe(1);
    const storedPerson = await personModel.collection.findOne({
      googleSubject: 'google-new-001',
    });
    expect(storedPerson).not.toHaveProperty('isAdmin');
    expect(storedPerson).not.toHaveProperty('configs');
  });

  it('creates and uses a revocable native Bearer session without CSRF', async () => {
    const { accessToken } = await createNativeSession('google-native-001');

    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    const mutationResponse = await request(app.getHttpServer())
      .patch('/auth/me/configs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ theme: 'dark' });
    const csrfResponse = await request(app.getHttpServer())
      .get('/auth/csrf')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toMatchObject({
      data: { name: 'Native Runner' },
    });
    expect(mutationResponse.status).toBe(200);
    expect(mutationResponse.body).toMatchObject({
      data: { configs: { theme: 'dark' } },
    });
    expect(csrfResponse.status).toBe(403);
    expect(csrfResponse.body).toMatchObject({ code: 'CSRF_NOT_AVAILABLE' });

    const jwtPayload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString(),
    ) as { jti: string };
    const stored = await redisClient.get(
      `dall-fit-auth-e2e:test:session:${jwtPayload.jti}`,
    );
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ channel: 'native' });
  });

  it('rejects invalid native identity tokens without creating state', async () => {
    const googleOAuthService = app.get(GoogleOAuthService);
    const verifySpy = vi
      .spyOn(googleOAuthService, 'verifyNativeIdentityToken')
      .mockRejectedValueOnce(new InvalidGoogleIdentityError());

    const response = await request(app.getHttpServer())
      .post('/auth/native/session')
      .send({ identityToken: 'invalid-e2e-google-token' });
    verifySpy.mockRestore();

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'GOOGLE_IDENTITY_INVALID' });
    await expect(personModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects simultaneous cookie and Bearer transports', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        email: 'ambiguous@example.test',
        googleSubject: 'google-ambiguous-web-001',
        name: 'Ambiguous Runner',
        photoUrl: null,
      })
      .expect(204);
    const { accessToken } = await createNativeSession(
      'google-ambiguous-native-001',
    );

    const response = await agent
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'AUTH_TRANSPORT_AMBIGUOUS',
    });
  });

  it('revokes native sessions idempotently without affecting web logout', async () => {
    const { accessToken } = await createNativeSession(
      'google-logout-native-001',
    );

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete('/auth/native/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete('/auth/native/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete('/auth/native/session')
      .set('Authorization', 'Bearer malformed')
      .expect(204);
    await request(app.getHttpServer())
      .delete('/auth/native/session')
      .expect(204);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('maps a legacy person without configs to an empty public object', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-legacy-001',
        name: 'Legacy Runner',
        email: 'legacy.runner@example.test',
        photoUrl: null,
      });
    await personModel.collection.updateOne(
      { googleSubject: 'google-legacy-001' },
      { $unset: { configs: 1 } },
    );

    const response = await agent.get('/auth/me');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { configs: {} } });
    const storedPerson = await personModel.collection.findOne({
      googleSubject: 'google-legacy-001',
    });
    expect(storedPerson).not.toHaveProperty('configs');
  });

  it('updates the current person theme and returns the public person', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-theme-001',
        name: 'Theme Runner',
        email: 'theme.runner@example.test',
        photoUrl: null,
      });
    const csrfToken = await getCsrfToken(agent);

    const firstResponse = await agent
      .patch('/auth/me/configs')
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', csrfToken)
      .send({ theme: 'dark' });
    const secondResponse = await agent
      .patch('/auth/me/configs')
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', csrfToken)
      .send({ theme: 'dark' });

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body).toMatchObject({
      data: { configs: { theme: 'dark' }, name: 'Theme Runner' },
    });
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body).toMatchObject({
      data: { configs: { theme: 'dark' } },
    });
    const storedPerson = await personModel.collection.findOne({
      googleSubject: 'google-theme-001',
    });
    expect(storedPerson).toMatchObject({ configs: { theme: 'dark' } });
    await expect(
      personModel.countDocuments({ googleSubject: 'google-theme-001' }),
    ).resolves.toBe(1);
  });

  it('rejects invalid theme config bodies without changing the person', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-invalid-theme-001',
        name: 'Invalid Theme Runner',
        email: 'invalid.theme@example.test',
        photoUrl: null,
      });
    const csrfToken = await getCsrfToken(agent);

    for (const body of [
      {},
      { theme: 'system' },
      { additional: true, theme: 'light' },
    ]) {
      const response = await agent
        .patch('/auth/me/configs')
        .set('Origin', 'http://localhost:3000')
        .set('x-csrf-token', csrfToken)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    const storedPerson = await personModel.collection.findOne({
      googleSubject: 'google-invalid-theme-001',
    });
    expect(storedPerson).not.toHaveProperty('configs');
  });

  it('returns the admin flag for an administrator and preserves it on login', async () => {
    await personModel.create({
      googleSubject: 'google-admin-001',
      name: 'Admin Runner',
      email: 'admin.runner@example.test',
      photoUrl: null,
      isAdmin: true,
    });
    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-admin-001',
        name: 'Changed Admin',
        email: 'changed.admin@example.test',
        photoUrl: 'https://example.test/changed-admin.png',
      });
    const meResponse = await agent.get('/auth/me');

    expect(loginResponse.status).toBe(204);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toMatchObject({
      data: {
        name: 'Changed Admin',
        email: 'changed.admin@example.test',
        isAdmin: true,
      },
    });
    const storedPerson = await personModel.collection.findOne({
      googleSubject: 'google-admin-001',
    });
    expect(storedPerson).toMatchObject({ isAdmin: true });
  });

  it('applies promotion and revocation on the next request without replacing the session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-promoted-001',
        name: 'Promoted Runner',
        email: 'promoted.runner@example.test',
        photoUrl: null,
      });

    await personModel
      .updateOne(
        { googleSubject: 'google-promoted-001' },
        { $set: { isAdmin: true } },
      )
      .exec();
    const promotedResponse = await agent.get('/auth/me');

    expect(promotedResponse.body).toMatchObject({
      data: { isAdmin: true },
    });

    await personModel
      .updateOne(
        { googleSubject: 'google-promoted-001' },
        { $unset: { isAdmin: 1 } },
      )
      .exec();
    const revokedResponse = await agent.get('/auth/me');
    const revokedBody = revokedResponse.body as {
      data: Record<string, unknown>;
    };

    expect(revokedResponse.status).toBe(200);
    expect(revokedBody.data).not.toHaveProperty('isAdmin');
  });

  it('synchronizes an existing provider profile without creating another person', async () => {
    const firstAgent = request.agent(app.getHttpServer());
    const secondAgent = request.agent(app.getHttpServer());

    await firstAgent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-existing-001',
        name: 'Taylor Fit',
        email: 'taylor.fit@example.test',
        photoUrl: 'https://example.test/taylor.png',
      });
    await secondAgent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-existing-001',
        name: 'Changed Name',
        email: 'changed@example.test',
        photoUrl: null,
      });
    const synchronizedPerson = await personModel.collection.findOne({
      googleSubject: 'google-existing-001',
    });
    await secondAgent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-existing-001',
        name: 'Changed Name',
        email: 'changed@example.test',
        photoUrl: null,
      });
    const meResponse = await secondAgent.get('/auth/me');
    const unchangedPerson = await personModel.collection.findOne({
      googleSubject: 'google-existing-001',
    });

    expect(meResponse.body).toMatchObject({
      data: {
        name: 'Changed Name',
        email: 'changed@example.test',
        photoUrl: null,
      },
    });
    await expect(
      personModel.countDocuments({ googleSubject: 'google-existing-001' }),
    ).resolves.toBe(1);
    expect(unchangedPerson?.updatedAt).toEqual(synchronizedPerson?.updatedAt);
  });

  it('hides the test login when the key is invalid', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/test-login')
      .set('x-auth-test-key', 'invalid-local-key')
      .send({
        googleSubject: 'google-new-001',
        name: 'Alex Runner',
        email: 'alex.runner@example.test',
        photoUrl: null,
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(personModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects malformed test identities before persistence', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: '',
        name: '',
        email: 'invalid',
      });

    expect(response.status).toBe(400);
    await expect(personModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects an attempt to grant admin access through the test login body', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-escalation-001',
        name: 'Escalation Attempt',
        email: 'escalation@example.test',
        photoUrl: null,
        isAdmin: true,
      });

    expect(response.status).toBe(400);
    await expect(personModel.countDocuments()).resolves.toBe(0);
  });

  it('starts Google OAuth with protected temporary cookies', async () => {
    const prepareResponse = await request(app.getHttpServer()).post(
      '/auth/google',
    );
    const response = await request(app.getHttpServer()).get('/auth/google');

    expect(prepareResponse.status).toBe(404);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    expect(response.headers.location).toContain('scope=openid');
    expect(response.headers.location).toContain('code_challenge_method=S256');
    expect(response.headers['set-cookie']).toHaveLength(3);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${OAUTH_STATE_COOKIE}=`),
        expect.stringContaining(`${OAUTH_NONCE_COOKIE}=`),
        expect.stringContaining(`${OAUTH_CODE_VERIFIER_COOKIE}=`),
      ]),
    );
    for (const cookie of response.headers['set-cookie'] ?? []) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
    }
  });

  it('accepts Google metadata and rejects a callback whose state differs', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/callback?code=fake-code&state=wrong-state&iss=https%3A%2F%2Faccounts.google.com&scope=email+profile+openid&authuser=0&prompt=consent',
      )
      .set(
        'Cookie',
        `${OAUTH_STATE_COOKIE}=expected-state; ${OAUTH_NONCE_COOKIE}=fake-nonce; ${OAUTH_CODE_VERIFIER_COOKIE}=fake-verifier`,
      );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'http://localhost:3000/?authError=oauth_failed',
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${OAUTH_STATE_COOKIE}=;`),
        expect.stringContaining(`${OAUTH_NONCE_COOKIE}=;`),
        expect.stringContaining(`${OAUTH_CODE_VERIFIER_COOKIE}=;`),
      ]),
    );
    await expect(personModel.countDocuments()).resolves.toBe(0);
  });

  it('clears temporary OAuth cookies when validation rejects the callback', async () => {
    const response = await request(app.getHttpServer())
      .get('/callback?error=')
      .set(
        'Cookie',
        `${OAUTH_STATE_COOKIE}=state; ${OAUTH_NONCE_COOKIE}=nonce; ${OAUTH_CODE_VERIFIER_COOKIE}=verifier`,
      );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {},
      requestId: response.headers['x-request-id'],
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${OAUTH_STATE_COOKIE}=;`),
        expect.stringContaining(`${OAUTH_NONCE_COOKIE}=;`),
        expect.stringContaining(`${OAUTH_CODE_VERIFIER_COOKIE}=;`),
      ]),
    );
  });

  it('returns a normalized 500 without session when OAuth fails technically', async () => {
    const googleOAuthService = app.get(GoogleOAuthService);
    const exchangeSpy = vi
      .spyOn(googleOAuthService, 'exchangeCode')
      .mockRejectedValueOnce(new Error('provider unavailable'));

    const response = await request(app.getHttpServer())
      .get('/callback?code=fake-code&state=expected-state')
      .set(
        'Cookie',
        `${OAUTH_STATE_COOKIE}=expected-state; ${OAUTH_NONCE_COOKIE}=fake-nonce; ${OAUTH_CODE_VERIFIER_COOKIE}=fake-verifier`,
      );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      details: {},
      message: 'An unexpected error occurred.',
      requestId: response.headers['x-request-id'],
    });
    expect(response.headers.location).toBeUndefined();
    expect(response.headers['set-cookie']).toHaveLength(3);
    expect(response.headers['set-cookie']).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${AUTH_SESSION_COOKIE}=`),
      ]),
    );
    exchangeSpy.mockRestore();
  });

  it('clears temporary OAuth cookies when the callback is rate limited', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer()).get('/callback').expect(302);
    }

    const response = await request(app.getHttpServer()).get('/callback');

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      requestId: response.headers['x-request-id'],
    });
    expect(response.headers['set-cookie']).toHaveLength(3);
  });

  it('rejects a validly signed session after its person is removed', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-removed-001',
        name: 'Removed Person',
        email: 'removed@example.test',
        photoUrl: null,
      });
    await personModel
      .deleteMany({ googleSubject: 'google-removed-001' })
      .exec();

    const response = await agent.get('/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('requires the exact origin and CSRF token on authenticated mutations', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-csrf-001',
        name: 'CSRF Runner',
        email: 'csrf.runner@example.test',
        photoUrl: null,
      })
      .expect(204);
    const csrfResponse = await agent.get('/auth/csrf').expect(200);
    const csrfBody = csrfResponse.body as { data: { token: string } };
    expect(csrfResponse.headers['cache-control']).toBe('no-store');

    const missingProtection = await agent
      .patch('/auth/me/configs')
      .send({ theme: 'dark' });
    const wrongOrigin = await agent
      .patch('/auth/me/configs')
      .set('Origin', 'http://malicious.example')
      .set('x-csrf-token', csrfBody.data.token)
      .send({ theme: 'dark' });
    const valid = await agent
      .patch('/auth/me/configs')
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', csrfBody.data.token)
      .send({ theme: 'dark' });

    expect(missingProtection.status).toBe(403);
    expect(missingProtection.body).toMatchObject({
      code: 'CSRF_VALIDATION_FAILED',
    });
    expect(wrongOrigin.status).toBe(403);
    expect(valid.status).toBe(200);
  });

  it('revokes the current session and keeps logout idempotent without one', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send({
        googleSubject: 'google-logout-001',
        name: 'Logout Runner',
        email: 'logout.runner@example.test',
        photoUrl: null,
      })
      .expect(204);
    const csrfToken = await getCsrfToken(agent);

    const logoutResponse = await agent
      .post('/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', csrfToken);
    const revokedResponse = await agent.get('/auth/me');
    const anonymousLogout = await request(app.getHttpServer()).post(
      '/auth/logout',
    );

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers['set-cookie']).toHaveLength(2);
    expect(revokedResponse.status).toBe(401);
    expect(anonymousLogout.status).toBe(204);
  });

  it('fails an old session closed after an isolated Redis dataset reset', async () => {
    const agent = request.agent(app.getHttpServer());
    const identity = {
      googleSubject: 'google-reset-001',
      name: 'Reset Runner',
      email: 'reset.runner@example.test',
      photoUrl: null,
    };
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send(identity)
      .expect(204);
    await redisClient.flushdb();

    await agent.get('/auth/me').expect(401);
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', testBypassKey)
      .send(identity)
      .expect(204);
    await agent.get('/auth/me').expect(200);
  });

  it('applies the distributed Google start limit and emits Retry-After', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer()).get('/auth/google').expect(302);
    }

    const limitedResponse = await request(app.getHttpServer()).get(
      '/auth/google',
    );
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers['retry-after']).toBeDefined();
    expect(limitedResponse.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('uses exact credentialed CORS and does not charge preflight requests', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await request(app.getHttpServer())
        .options('/auth/google')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);
    }
    const response = await request(app.getHttpServer())
      .get('/auth/google')
      .set('Origin', 'http://localhost:3000');

    expect(response.status).toBe(302);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-expose-headers']).toBe(
      'X-Resource-Version,X-Request-Id',
    );
    expect(response.headers.vary).toContain('Origin');

    const mutationPreflight = await request(app.getHttpServer())
      .options('/global/training-plans/64b000000000000000000001')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PATCH')
      .set(
        'Access-Control-Request-Headers',
        'Content-Type, Idempotency-Key, X-Resource-Version, X-CSRF-Token, X-Request-Id',
      );
    expect(mutationPreflight.status).toBe(204);
    expect(mutationPreflight.headers['access-control-allow-headers']).toContain(
      'X-Resource-Version',
    );
    expect(mutationPreflight.headers['access-control-allow-headers']).toContain(
      'Idempotency-Key',
    );
    expect(mutationPreflight.headers['access-control-allow-headers']).toContain(
      'Authorization',
    );
    expect(
      mutationPreflight.headers['access-control-allow-headers'],
    ).not.toContain('If-Match');
  });

  it('correlates success, no-content, redirect, error and preflight responses', async () => {
    const liveness = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'client-request-001');
    const ready = await request(app.getHttpServer()).get('/ready');
    const noContent = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('x-request-id', 'client-request-204');
    const redirect = await request(app.getHttpServer()).get('/auth/google');
    const error = await request(app.getHttpServer()).get('/missing');
    const preflight = await request(app.getHttpServer())
      .options('/auth/google')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-Request-Id')
      .set('x-request-id', 'invalid/request/id');

    expect(liveness.status).toBe(200);
    expect(liveness.body).toEqual({ status: 'ok' });
    expect(liveness.headers['x-request-id']).toBe('client-request-001');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({
      details: { mongodb: { status: 'up' }, redis: { status: 'up' } },
      status: 'ok',
    });
    const readyBody = ready.body as { details: Record<string, unknown> };
    expect(Object.keys(readyBody.details).sort()).toEqual(['mongodb', 'redis']);
    for (const response of [ready, noContent, redirect, error, preflight]) {
      expect(response.headers['x-request-id']).toMatch(
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
      );
    }
    expect(preflight.headers['access-control-allow-headers']).toContain(
      'X-Request-Id',
    );
    expect(preflight.headers['x-request-id']).not.toBe('invalid/request/id');
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    if (mongoServer !== undefined) {
      await mongoServer.stop();
    }
    await redisClient?.quit();
    await redisServer?.stop();
  });
});
