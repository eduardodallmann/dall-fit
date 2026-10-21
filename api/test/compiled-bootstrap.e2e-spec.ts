import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

const apiDirectory = process.cwd();

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate the compiled API test port.');
  }

  return address.port;
}

async function stopApplication(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const closed = new Promise<void>((resolve) => {
    child.once('close', () => resolve());
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
  timeout.unref();
  child.kill('SIGTERM');

  try {
    await closed;
  } finally {
    clearTimeout(timeout);
  }
}

describe('Compiled production bootstrap (e2e)', () => {
  it('reproduces the Lambda CommonJS/ESM failure without the runtime opt-in', () => {
    const result = spawnSync(
      process.execPath,
      ['-e', 'require("@nestjs/common")'],
      {
        cwd: apiDirectory,
        encoding: 'utf8',
        env: { NODE_OPTIONS: '--no-experimental-require-module' },
        timeout: 10_000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ERR_REQUIRE_ESM');
  });

  it('serves HTTP from the generated CommonJS build with require(esm) enabled', async () => {
    let mongoServer: MongoMemoryServer | undefined;
    let redisServer: RedisMemoryServer | undefined;
    let child: ChildProcess | undefined;
    let directory: string | undefined;

    try {
      mongoServer = await MongoMemoryServer.create({
        binary: { version: '8.0.12' },
      });
      redisServer = new RedisMemoryServer({ binary: { version: '8.8.1' } });
      await redisServer.start();
      directory = await mkdtemp(join(tmpdir(), 'dall-fit-compiled-e2e-'));
      const port = await getAvailablePort();
      const googleCredential = Buffer.from(
        JSON.stringify({
          web: {
            client_id: 'fake-client.apps.googleusercontent.com',
            client_secret: 'fake-client-secret',
            redirect_uris: [`http://localhost:${port}/callback`],
          },
        }),
      ).toString('base64');

      child = spawn(
        process.execPath,
        [resolve(apiDirectory, 'dist/src/main.js')],
        {
          // An empty cwd and an explicit environment prevent loading local secrets.
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            // Lambda removes its disable flag when NODE_OPTIONS opts back in.
            // The last flag wins here to emulate that behavior on upstream Node.
            NODE_OPTIONS:
              '--no-experimental-require-module --experimental-require-module',
            PORT: String(port),
            LOG_LEVEL: 'error',
            MONGODB_URI: mongoServer.getUri('dall-fit-compiled-e2e'),
            REDIS_URL: `redis://${await redisServer.getHost()}:${await redisServer.getPort()}`,
            REDIS_NAMESPACE: 'dall-fit-compiled-e2e',
            GOOGLE_OAUTH_CREDENTIALS_BASE64: googleCredential,
            AUTH_SESSION_SECRET: 'e2e-session-secret-with-32-characters',
            AUTH_COOKIE_SECURE: 'false',
            ANDROID_MIN_VERSION_CODE: '1',
            ANDROID_PLAY_STORE_URL:
              'https://play.google.com/store/apps/details?id=com.dallfit.app',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const application = child;
      let output = '';
      let spawnError: Error | undefined;
      const captureOutput = (chunk: Buffer) => {
        output = `${output}${chunk.toString()}`.slice(-20_000);
      };
      application.stdout?.on('data', captureOutput);
      application.stderr?.on('data', captureOutput);
      application.on('error', (error) => {
        spawnError = error;
      });
      const baseUrl = `http://127.0.0.1:${port}`;

      await expect
        .poll(
          async () => {
            if (spawnError) {
              throw spawnError;
            }
            if (
              application.exitCode !== null ||
              application.signalCode !== null
            ) {
              throw new Error(
                `Compiled API exited before listening:\n${output}`,
              );
            }

            try {
              const response = await request(baseUrl)
                .get('/health')
                .timeout(1_000);
              return response.status;
            } catch {
              return 0;
            }
          },
          { timeout: 30_000, interval: 200 },
        )
        .toBe(200);

      const liveness = await request(baseUrl).get('/health').expect(200);
      expect(liveness.body).toEqual({ status: 'ok' });
      const readiness = await request(baseUrl).get('/ready').expect(200);
      expect(readiness.body).toMatchObject({
        status: 'ok',
        details: { mongodb: { status: 'up' }, redis: { status: 'up' } },
      });
      const currentPerson = await request(baseUrl).get('/auth/me').expect(401);
      expect(currentPerson.body).toMatchObject({
        code: 'AUTHENTICATION_REQUIRED',
        requestId: currentPerson.headers['x-request-id'],
      });
      expect(output).not.toContain('ERR_REQUIRE_ESM');
    } finally {
      if (child) {
        await stopApplication(child);
      }
      await Promise.all([mongoServer?.stop(), redisServer?.stop()]);
      if (directory) {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }, 300_000);
});
