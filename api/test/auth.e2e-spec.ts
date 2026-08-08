import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AUTH_SESSION_COOKIE,
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '~/auth/auth.constants';
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

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let mongoServer: MongoMemoryServer;
  let personModel: Model<PersonDocument>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: '8.0.12' },
    });
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = mongoServer.getUri('dall-fit-e2e');
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
    await personModel.syncIndexes();
  });

  beforeEach(async () => {
    await personModel.deleteMany({}).exec();
  });

  it('rejects protected endpoints without a session', async () => {
    const rootResponse = await request(app.getHttpServer()).get('/');
    const meResponse = await request(app.getHttpServer()).get('/auth/me');
    const configsResponse = await request(app.getHttpServer())
      .patch('/auth/me/configs')
      .send({ theme: 'dark' });

    expect(rootResponse.status).toBe(401);
    expect(rootResponse.body).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
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
      .set('x-auth-test-key', 'local-auth-test-key')
      .send({
        googleSubject: 'google-new-001',
        name: 'Alex Runner',
        email: 'alex.runner@example.test',
        photoUrl: 'https://example.test/alex.png',
      });
    const meResponse = await agent.get('/auth/me');
    const rootResponse = await agent.get('/');

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
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.text).toBe('Hello World!');
    await expect(personModel.countDocuments()).resolves.toBe(1);
    const storedPerson = await personModel.collection.findOne({
      googleSubject: 'google-new-001',
    });
    expect(storedPerson).not.toHaveProperty('isAdmin');
    expect(storedPerson).not.toHaveProperty('configs');
  });

  it('maps a legacy person without configs to an empty public object', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', 'local-auth-test-key')
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
      .set('x-auth-test-key', 'local-auth-test-key')
      .send({
        googleSubject: 'google-theme-001',
        name: 'Theme Runner',
        email: 'theme.runner@example.test',
        photoUrl: null,
      });

    const firstResponse = await agent
      .patch('/auth/me/configs')
      .send({ theme: 'dark' });
    const secondResponse = await agent
      .patch('/auth/me/configs')
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
      .set('x-auth-test-key', 'local-auth-test-key')
      .send({
        googleSubject: 'google-invalid-theme-001',
        name: 'Invalid Theme Runner',
        email: 'invalid.theme@example.test',
        photoUrl: null,
      });

    for (const body of [
      {},
      { theme: 'system' },
      { additional: true, theme: 'light' },
    ]) {
      const response = await agent.patch('/auth/me/configs').send(body);

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
      .set('x-auth-test-key', 'local-auth-test-key')
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
        name: 'Admin Runner',
        email: 'admin.runner@example.test',
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
      .set('x-auth-test-key', 'local-auth-test-key')
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

  it('reuses an existing person without overwriting their original profile', async () => {
    const firstAgent = request.agent(app.getHttpServer());
    const secondAgent = request.agent(app.getHttpServer());

    await firstAgent
      .post('/auth/test-login')
      .set('x-auth-test-key', 'local-auth-test-key')
      .send({
        googleSubject: 'google-existing-001',
        name: 'Taylor Fit',
        email: 'taylor.fit@example.test',
        photoUrl: 'https://example.test/taylor.png',
      });
    await secondAgent
      .post('/auth/test-login')
      .set('x-auth-test-key', 'local-auth-test-key')
      .send({
        googleSubject: 'google-existing-001',
        name: 'Changed Name',
        email: 'changed@example.test',
        photoUrl: null,
      });
    const meResponse = await secondAgent.get('/auth/me');

    expect(meResponse.body).toMatchObject({
      data: {
        name: 'Taylor Fit',
        email: 'taylor.fit@example.test',
        photoUrl: 'https://example.test/taylor.png',
      },
    });
    await expect(
      personModel.countDocuments({ googleSubject: 'google-existing-001' }),
    ).resolves.toBe(1);
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
      .set('x-auth-test-key', 'local-auth-test-key')
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
      .set('x-auth-test-key', 'local-auth-test-key')
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

    expect(prepareResponse.status).toBe(200);
    const prepareBody = prepareResponse.body as {
      data: { authorizationUrl: string };
    };
    expect(prepareBody.data.authorizationUrl).toContain('accounts.google.com');
    expect(prepareResponse.headers['set-cookie']).toHaveLength(2);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    expect(response.headers.location).toContain('scope=openid');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${OAUTH_STATE_COOKIE}=`),
        expect.stringContaining(`${OAUTH_NONCE_COOKIE}=`),
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
        `${OAUTH_STATE_COOKIE}=expected-state; ${OAUTH_NONCE_COOKIE}=fake-nonce`,
      );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'http://localhost:3000/?authError=oauth_failed',
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${OAUTH_STATE_COOKIE}=;`),
        expect.stringContaining(`${OAUTH_NONCE_COOKIE}=;`),
      ]),
    );
    await expect(personModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects a validly signed session after its person is removed', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', 'local-auth-test-key')
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

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    if (mongoServer !== undefined) {
      await mongoServer.stop();
    }
  });
});
