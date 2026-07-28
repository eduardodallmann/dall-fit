import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';

const host = '127.0.0.1';
const mongoPort = 27_017;
const mongoDatabase = 'dall-fit';
const redisPort = 6_379;
const workspacePackagePath = new URL('../../package.json', import.meta.url);
const workspacePackage = JSON.parse(
  await readFile(workspacePackagePath, 'utf8'),
);
const mongoVersion = workspacePackage.mongodbMemoryServer?.version;
const redisVersion = workspacePackage.redisMemoryServer?.version;

if (typeof mongoVersion !== 'string' || typeof redisVersion !== 'string') {
  throw new Error(
    'MongoDB and Redis versions must be configured in the workspace package.json.',
  );
}

let mongoServer;
let redisServer;
let stopping;

function stopInfrastructure() {
  if (stopping !== undefined) {
    return stopping;
  }

  stopping = (async () => {
    process.stdout.write('[dev:infra] Stopping MongoDB and Redis...\n');

    const results = await Promise.allSettled([
      mongoServer?.stop(),
      redisServer?.stop(),
    ]);
    const failure = results.find((result) => result.status === 'rejected');

    if (failure?.status === 'rejected') {
      throw failure.reason;
    }

    process.stdout.write('[dev:infra] MongoDB and Redis stopped.\n');
  })();

  return stopping;
}

function handleSignal(signal) {
  process.stdout.write(`[dev:infra] Received ${signal}.\n`);
  void stopInfrastructure().catch((error) => {
    process.stderr.write(`[dev:infra] Shutdown failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}

process.once('SIGINT', () => handleSignal('SIGINT'));
process.once('SIGTERM', () => handleSignal('SIGTERM'));

try {
  redisServer = new RedisMemoryServer({
    binary: { version: redisVersion },
    instance: { ip: host, port: redisPort },
  });
  await redisServer.start();

  const actualRedisPort = await redisServer.getPort();
  if (actualRedisPort !== redisPort) {
    throw new Error(
      `Redis port ${redisPort} is unavailable; stop the process using it before starting development infrastructure.`,
    );
  }

  mongoServer = await MongoMemoryServer.create({
    binary: { version: mongoVersion },
    instance: {
      dbName: mongoDatabase,
      ip: host,
      port: mongoPort,
      portGeneration: false,
      storageEngine: 'wiredTiger',
    },
  });

  process.stdout.write(
    `[dev:infra] Redis ${redisVersion} ready on ${host}:${redisPort}.\n`,
  );
  process.stdout.write(
    `[dev:infra] MongoDB ${mongoVersion} ready on ${host}:${mongoPort}/${mongoDatabase}.\n`,
  );
  process.stdout.write(
    '[dev:infra] Data is ephemeral and will be discarded when this process stops.\n',
  );
} catch (error) {
  await stopInfrastructure().catch(() => undefined);
  process.stderr.write(`[dev:infra] Startup failed: ${String(error)}\n`);
  process.exitCode = 1;
}
