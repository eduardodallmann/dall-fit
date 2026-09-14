import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisClientService } from '~/redis/redis-client.service';
import type { RedisKeyService } from '~/redis/redis-key.service';
import { RedisUnavailableError } from '~/redis/redis.errors';
import {
  OfflineTrainingSnapshotSyncInProgressError,
  OfflineTrainingSnapshotUnavailableError,
} from '~/training/errors/offline-training-snapshot.errors';
import { OfflineTrainingSnapshotLockService } from '~/training/services/offline-training-snapshot-lock.service';

describe('OfflineTrainingSnapshotLockService', () => {
  const set = vi.fn();
  const evalMock = vi.fn();
  const client = { eval: evalMock, set } as unknown as Redis;
  const redis = {
    execute: vi.fn(async (operation: (value: Redis) => Promise<unknown>) =>
      operation(client),
    ),
  };
  const keys = { create: vi.fn(() => 'namespace:lock:sensitive') };
  let service: OfflineTrainingSnapshotLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OfflineTrainingSnapshotLockService(
      redis as unknown as RedisClientService,
      keys as unknown as RedisKeyService,
    );
  });

  it('acquires with an opaque token and bounded NX TTL', async () => {
    set.mockResolvedValueOnce('OK');
    const lock = await service.acquire('installation-sensitive');
    expect(lock.key).toBe('namespace:lock:sensitive');
    expect(set).toHaveBeenCalledWith(lock.key, lock.token, 'PX', 15_000, 'NX');
  });

  it('fails immediately on contention', async () => {
    set.mockResolvedValueOnce(null);
    await expect(
      service.acquire('installation-sensitive'),
    ).rejects.toBeInstanceOf(OfflineTrainingSnapshotSyncInProgressError);
  });

  it('releases only through the token-checking script', async () => {
    evalMock.mockResolvedValueOnce(1);
    await service.release({ key: 'namespace:lock:sensitive', token: 'opaque' });
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET', KEYS[1]) == ARGV[1]"),
      1,
      'namespace:lock:sensitive',
      'opaque',
    );
  });

  it.each(['acquire', 'release'] as const)(
    'maps Redis failure during %s to snapshot unavailability',
    async (operation) => {
      if (operation === 'acquire')
        set.mockRejectedValueOnce(new RedisUnavailableError());
      else evalMock.mockRejectedValueOnce(new RedisUnavailableError());
      const promise =
        operation === 'acquire'
          ? service.acquire('installation-sensitive')
          : service.release({
              key: 'namespace:lock:sensitive',
              token: 'opaque',
            });
      await expect(promise).rejects.toBeInstanceOf(
        OfflineTrainingSnapshotUnavailableError,
      );
    },
  );
});
