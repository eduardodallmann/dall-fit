import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { type Model } from 'mongoose';
import { RedisMemoryServer } from 'redis-memory-server';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  AcceptedTerms,
  ApiResponse,
  TermsDocument,
} from '@dall-fit/types';

import { AuthSessionService } from '~/auth/services/auth-session.service';
import { configureApplication } from '~/configure-application';
import { PersonDocument } from '~/person/repositories/person.schema';
import {
  TERMS_ACCEPTANCE_MODEL,
  TERMS_MODEL,
  type StoredAcceptance,
  type StoredTerms,
} from '~/terms/repositories/terms.schema';

import { resetTermsFixture, termsFixtureFields } from './helpers/terms-fixture';

const bypassKey = 'terms-e2e-only-key-with-at-least-32-random-bytes';
describe('Terms (e2e)', () => {
  let app: INestApplication<App>;
  let mongo: MongoMemoryServer;
  let redis: RedisMemoryServer;
  let client: Redis;
  let people: Model<PersonDocument>;
  let docs: Model<StoredTerms>;
  let receipts: Model<StoredAcceptance>;
  const tokens = new WeakMap<ReturnType<typeof request.agent>, string>();
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.0.12' } });
    redis = new RedisMemoryServer({ binary: { version: '8.8.1' } });
    await redis.start();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      MONGODB_URI: mongo.getUri('terms-e2e'),
      REDIS_URL: `redis://${await redis.getHost()}:${await redis.getPort()}`,
      REDIS_NAMESPACE: 'terms-e2e',
      GOOGLE_OAUTH_CREDENTIALS_BASE64: Buffer.from(
        JSON.stringify({
          web: {
            client_id: 'fake-client.apps.googleusercontent.com',
            client_secret: 'fake-client-secret',
            redirect_uris: ['http://localhost:4000/callback'],
          },
        }),
      ).toString('base64'),
      ANDROID_MIN_VERSION_CODE: '1',
      ANDROID_PLAY_STORE_URL:
        'https://play.google.com/store/apps/details?id=com.dallfit.app',
      AUTH_SESSION_SECRET: 'terms-test-session-secret-with-32-characters',
      AUTH_COOKIE_SECURE: 'false',
      AUTH_TEST_BYPASS_ENABLED: 'true',
      AUTH_TEST_BYPASS_E2E_ENABLED: 'true',
      AUTH_TEST_BYPASS_KEY: bypassKey,
      UI_URL: 'http://localhost:3000',
    });
    const { AppModule } = await import('~/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    people = app.get(getModelToken(PersonDocument.name));
    docs = app.get(getModelToken(TERMS_MODEL));
    receipts = app.get(getModelToken(TERMS_ACCEPTANCE_MODEL));
    await Promise.all([docs.init(), receipts.init(), people.init()]);
    client = new Redis(
      `redis://${await redis.getHost()}:${await redis.getPort()}`,
    );
  });
  beforeEach(async () => {
    await resetTermsFixture(app);
    await people.deleteMany({});
    await client.flushdb();
  });
  afterAll(async () => {
    await app?.close();
    await client?.quit();
    await redis?.stop();
    await mongo?.stop();
  });

  async function login(admin = true) {
    const subject = admin ? 'terms-admin' : 'terms-person';
    const person = await people.create({
      googleSubject: subject,
      name: 'Pessoa de teste',
      email: `${subject}@example.test`,
      photoUrl: null,
      ...(admin ? { isAdmin: true } : {}),
    });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/test-login')
      .set('x-auth-test-key', bypassKey)
      .send({
        googleSubject: subject,
        name: 'Pessoa de teste',
        email: `${subject}@example.test`,
        photoUrl: null,
      })
      .expect(204);
    const csrf = await agent.get('/auth/csrf').expect(200);
    tokens.set(agent, (csrf.body as { data: { token: string } }).data.token);
    return { agent, person };
  }
  function mutate(agent: ReturnType<typeof request.agent>, path: string) {
    return agent
      .post(path)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', tokens.get(agent) ?? '');
  }
  async function publish(
    agent: ReturnType<typeof request.agent>,
    expected: string | null = null,
    fields = termsFixtureFields,
  ) {
    const draftResponse = await mutate(agent, '/admin/terms')
      .send(fields)
      .expect(201);
    const draft = (draftResponse.body as ApiResponse<TermsDocument>).data;
    const response = await mutate(agent, `/admin/terms/${draft.id}/publish`)
      .set('X-Resource-Version', String(draft.version))
      .send({
        expectedCurrentTermsId: expected,
        previewContentHash: draft.contentHash,
      })
      .expect(200);
    return (response.body as ApiResponse<TermsDocument>).data;
  }
  async function accept(
    agent: ReturnType<typeof request.agent>,
    doc: TermsDocument,
    status = 201,
  ) {
    const response = await mutate(agent, '/terms/acceptances')
      .send({
        termsVersionId: doc.id,
        contentHash: doc.contentHash,
        accepted: true,
        isAdult: true,
      })
      .expect(status);
    return (response.body as ApiResponse<AcceptedTerms>).data;
  }

  it('creates an authenticated account without accepting, and closes unconfigured business', async () => {
    const { agent } = await login(false);
    await agent.get('/auth/me').expect(200);
    await agent.get('/dashboard?timezone=UTC').expect(503);
    await agent.get('/admin/terms').expect(403);
    expect(await receipts.countDocuments()).toBe(0);
    expect((await agent.get('/terms/access').expect(200)).body).toMatchObject({
      data: { state: 'not-configured' },
    });
  });
  it('bootstraps, requires explicit declarations and keeps an idempotent immutable receipt', async () => {
    const { agent } = await login();
    const doc = await publish(agent);
    await agent.get('/admin/terms').expect(403);
    await agent.get('/training-plans').expect(403);
    await mutate(agent, '/terms/acceptances')
      .send({
        termsVersionId: doc.id,
        contentHash: doc.contentHash,
        accepted: true,
        isAdult: false,
      })
      .expect(400);
    await agent
      .post('/terms/acceptances')
      .send({
        termsVersionId: doc.id,
        contentHash: doc.contentHash,
        accepted: true,
        isAdult: true,
      })
      .expect(403);
    const first = await accept(agent, doc);
    const repeated = await accept(agent, doc, 200);
    expect(repeated.acceptance).toEqual(first.acceptance);
    expect(await receipts.countDocuments()).toBe(1);
    expect(first.access.state).toBe('accepted');
    await agent.get('/admin/terms').expect(200);
    const change = await agent
      .patch(`/admin/terms/${doc.id}`)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', tokens.get(agent) ?? '')
      .set('X-Resource-Version', String(doc.version))
      .send(termsFixtureFields)
      .expect(409);
    expect(change.body).toMatchObject({ code: 'TERMS_VERSION_IMMUTABLE' });
  });
  it('versions the identity and blocks old receipts on all business paths', async () => {
    const { agent } = await login();
    const first = await publish(agent);
    await accept(agent, first);
    const second = await publish(agent, first.id, {
      ...termsFixtureFields,
      operatorName: 'Outro responsável',
      operatorEmail: 'other@example.test',
    });
    for (const path of [
      '/dashboard?timezone=UTC',
      '/training-plans',
      '/global/training-plans',
      '/training',
      '/training-plans/exercise-library',
      '/training-plan-assistant/session',
    ]) {
      const response = await agent.get(path).expect(403);
      expect(response.body).toMatchObject({
        code: 'TERMS_ACCEPTANCE_REQUIRED',
        details: { id: second.id },
      });
    }
    await mutate(agent, '/terms/acceptances')
      .send({
        termsVersionId: first.id,
        contentHash: first.contentHash,
        accepted: true,
        isAdult: true,
      })
      .expect(409);
    const old = await agent.get(`/terms/versions/${first.id}`).expect(200);
    expect((old.body as ApiResponse<TermsDocument>).data.contentHash).toBe(
      first.contentHash,
    );
    expect((old.body as ApiResponse<TermsDocument>).data.operatorEmail).toBe(
      termsFixtureFields.operatorEmail,
    );
    await accept(agent, second);
    expect(await receipts.countDocuments()).toBe(2);
  });
  it('orders simultaneous publications and prevents duplicate acceptances under concurrency', async () => {
    const { agent } = await login();
    const first = await publish(agent);
    await accept(agent, first);
    const draftResponses = await Promise.all([
      mutate(agent, '/admin/terms').send(termsFixtureFields),
      mutate(agent, '/admin/terms').send(termsFixtureFields),
    ]);
    const drafts = draftResponses.map(
      (response) => (response.body as ApiResponse<TermsDocument>).data,
    );
    const published = await Promise.all(
      drafts.map((draft) =>
        mutate(agent, `/admin/terms/${draft.id}/publish`)
          .set('X-Resource-Version', String(draft.version))
          .send({
            expectedCurrentTermsId: first.id,
            previewContentHash: draft.contentHash,
          }),
      ),
    );
    expect(published.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const latest = (
      published.find((response) => response.status === 200)
        ?.body as ApiResponse<TermsDocument>
    ).data;
    const body = {
      termsVersionId: latest.id,
      contentHash: latest.contentHash,
      accepted: true,
      isAdult: true,
    };
    const accepted = await Promise.all([
      mutate(agent, '/terms/acceptances').send(body),
      mutate(agent, '/terms/acceptances').send(body),
    ]);
    expect(accepted.map((response) => response.status).sort()).toEqual([
      200, 201,
    ]);
    expect(await receipts.countDocuments({ termsVersionId: latest.id })).toBe(
      1,
    );
  });
  it('sanitizes before rendering, rejects stale preview and validates the technical revision', async () => {
    const { agent } = await login();
    const response = await mutate(agent, '/admin/terms')
      .send({
        ...termsFixtureFields,
        bodyHtml:
          '<p onclick="bad()">Texto <strong>seguro</strong></p><script>bad()</script><img src=x>',
      })
      .expect(201);
    const draft = (response.body as ApiResponse<TermsDocument>).data;
    expect(draft.wasSanitized).toBe(true);
    expect(draft.contentHtml).not.toMatch(/onclick|<script|<img/);
    await mutate(agent, `/admin/terms/${draft.id}/publish`)
      .send({
        expectedCurrentTermsId: null,
        previewContentHash: draft.contentHash,
      })
      .expect(428);
    await mutate(agent, `/admin/terms/${draft.id}/publish`)
      .set('X-Resource-Version', String(draft.version))
      .send({
        expectedCurrentTermsId: null,
        previewContentHash: '0'.repeat(64),
      })
      .expect(409);
    expect(await docs.countDocuments({ state: 'published' })).toBe(0);
  });
  it('accepts only verified native identity and rejects snapshot before any write', async () => {
    const admin = await login();
    const doc = await publish(admin.agent);
    const user = await login(false);
    const native = await app
      .get(AuthSessionService)
      .createSession(user.person._id.toString(), 'native');
    const response = await request(app.getHttpServer())
      .post('/terms/acceptances')
      .set('Authorization', `Bearer ${native.token}`)
      .send({
        termsVersionId: doc.id,
        contentHash: doc.contentHash,
        accepted: true,
        isAdult: true,
      })
      .expect(201);
    expect(
      (response.body as ApiResponse<AcceptedTerms>).data.acceptance.channel,
    ).toBe('native');
    expect(
      (await user.agent.get('/terms/access').expect(200)).body,
    ).toMatchObject({ data: { state: 'accepted' } });
    expect(
      (await admin.agent.get('/terms/acceptances').expect(200)).body,
    ).toMatchObject({ data: [] });
  });
});
