import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';
import request from 'supertest';
import type { App } from 'supertest/types';
import { describe, expect, it, vi } from 'vitest';

const googleCredential = Buffer.from(
  JSON.stringify({
    web: {
      client_id: 'fake-client.apps.googleusercontent.com',
      client_secret: 'fake-client-secret',
      redirect_uris: ['http://localhost:4000/callback'],
    },
  }),
).toString('base64');

interface OperationalFixture {
  app: INestApplication<App>;
  mongoServer: MongoMemoryServer;
  redisServer: RedisMemoryServer;
}

async function createOperationalFixture(
  dependency: 'mongodb' | 'redis',
): Promise<OperationalFixture> {
  const mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.0.12' },
  });
  const redisServer = new RedisMemoryServer({ binary: { version: '8.8.1' } });
  await redisServer.start();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoServer.getUri(`dall-fit-${dependency}-e2e`);
  process.env.REDIS_URL = `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`;
  process.env.REDIS_NAMESPACE = `dall-fit-${dependency}-e2e`;
  process.env.GOOGLE_OAUTH_CREDENTIALS_BASE64 = googleCredential;
  process.env.AUTH_SESSION_SECRET = 'e2e-session-secret-with-32-characters';
  process.env.AUTH_COOKIE_SECURE = 'false';
  process.env.UI_URL = 'http://localhost:3000';

  vi.resetModules();
  const [{ AppModule }, { configureApplication }] = await Promise.all([
    import('~/app.module.js'),
    import('~/configure-application.js'),
  ]);
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  configureApplication(app);
  await app.init();
  const result = { app, mongoServer, redisServer };

  return result;
}

describe('Operational probes with unavailable dependencies (e2e)', () => {
  it.each(['mongodb', 'redis'] as const)(
    'keeps liveness up and returns a generic readiness 503 when %s is down',
    async (dependency) => {
      const fixture = await createOperationalFixture(dependency);

      try {
        if (dependency === 'mongodb') {
          await fixture.mongoServer.stop();
        } else {
          await fixture.redisServer.stop();
        }

        const liveness = await request(fixture.app.getHttpServer()).get(
          '/health',
        );
        const readiness = await request(fixture.app.getHttpServer()).get(
          '/ready',
        );

        expect(liveness.status).toBe(200);
        expect(liveness.body).toEqual({ status: 'ok' });
        expect(readiness.status).toBe(503);
        expect(readiness.body).toEqual({
          code: 'SERVICE_UNAVAILABLE',
          details: {},
          message: 'The service is temporarily unavailable.',
          requestId: readiness.headers['x-request-id'],
        });
      } finally {
        await fixture.app.close();
        await fixture.mongoServer.stop();
        await fixture.redisServer.stop();
      }
    },
  );
});
