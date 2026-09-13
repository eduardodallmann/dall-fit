import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisClientService } from '~/redis/redis-client.service';
import type { RedisKeyService } from '~/redis/redis-key.service';
import { SessionStoreService } from '~/redis/session-store.service';

describe('SessionStoreService', () => {
  const client = {
    del: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  };
  const redisClientService = {
    execute: vi.fn((operation: (redis: typeof client) => Promise<unknown>) =>
      operation(client),
    ),
  };
  const redisKeyService = {
    create: vi.fn((subject: string, identifier: string) =>
      ['test', subject, identifier].join(':'),
    ),
  };
  const service = new SessionStoreService(
    redisClientService as unknown as RedisClientService,
    redisKeyService as unknown as RedisKeyService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores a session with its channel and absolute expiration', async () => {
    client.set.mockResolvedValue('OK');
    const session = {
      channel: 'native' as const,
      csrfToken: 'csrf-token',
      expiresAt: 1_800_000_000,
      personId: 'person-001',
    };

    await service.create('jti-001', session);

    expect(client.set).toHaveBeenCalledWith(
      'test:session:jti-001',
      JSON.stringify(session),
      'PXAT',
      session.expiresAt * 1000,
      'NX',
    );
  });

  it('reads a valid session', async () => {
    client.get.mockResolvedValue(
      JSON.stringify({
        channel: 'web',
        csrfToken: 'csrf-token',
        expiresAt: 1_800_000_000,
        personId: 'person-001',
      }),
    );

    await expect(service.find('jti-001')).resolves.toMatchObject({
      channel: 'web',
      personId: 'person-001',
    });
  });

  it.each([
    '{not-json',
    JSON.stringify({
      csrfToken: 'legacy-csrf-token',
      expiresAt: 1_800_000_000,
      personId: 'person-001',
    }),
    JSON.stringify({
      channel: 'unknown',
      csrfToken: 'csrf-token',
      expiresAt: 1_800_000_000,
      personId: 'person-001',
    }),
  ])('invalidates malformed or legacy record %j', async (storedValue) => {
    client.get.mockResolvedValue(storedValue);

    await expect(service.find('jti-001')).resolves.toBeNull();
  });

  it('deletes the session key idempotently', async () => {
    client.del.mockResolvedValue(0);

    await expect(service.delete('jti-001')).resolves.toBeUndefined();
    expect(client.del).toHaveBeenCalledWith('test:session:jti-001');
  });
});
