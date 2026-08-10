import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

describe('RedisClientService', () => {
  const configValues: Record<string, number | string> = {
    REDIS_COMMAND_TIMEOUT_MS: 1_000,
    REDIS_CONNECT_TIMEOUT_MS: 1_000,
    REDIS_URL: 'redis://127.0.0.1:6379',
  };
  const configService = {
    get: vi.fn().mockReturnValue(undefined),
    getOrThrow: vi.fn((key: string) => configValues[key]),
  };
  let client: Redis;
  let service: RedisClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RedisClientService(configService as unknown as ConfigService);
    client = Reflect.get(service, 'client') as Redis;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('completes ping only when Redis returns PONG', async () => {
    vi.spyOn(client, 'ping').mockResolvedValue('PONG');

    await expect(service.ping()).resolves.toBeUndefined();
  });

  it('translates an unexpected ping response to Redis unavailability', async () => {
    vi.spyOn(client, 'ping').mockResolvedValue('unexpected');

    await expect(service.ping()).rejects.toBeInstanceOf(RedisUnavailableError);
  });
});
