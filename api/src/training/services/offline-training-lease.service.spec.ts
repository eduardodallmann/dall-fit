import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisClientService } from '~/redis/redis-client.service';
import type { RedisKeyService } from '~/redis/redis-key.service';
import { RedisUnavailableError } from '~/redis/redis.errors';
import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
  OfflineTrainingLeaseTakeoverRequiredError,
  OfflineTrainingLeaseUnavailableError,
} from '~/training/errors/offline-training-lease.errors';
import { OfflineTrainingLeaseService } from '~/training/services/offline-training-lease.service';
import type { TrainingClockService } from '~/training/services/training-clock.service';

describe('OfflineTrainingLeaseService', () => {
  const personId = 'person-sensitive';
  const installationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const now = new Date('2026-09-13T12:00:00.000Z');
  const expiresAt = '2026-09-20T12:00:00.000Z';
  const lease = {
    expiresAt,
    installationId,
    leaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    personId,
  };
  const evalMock = vi.fn();
  const client = { eval: evalMock } as unknown as Redis;
  const redis = {
    execute: vi.fn(async (operation: (value: Redis) => Promise<unknown>) =>
      operation(client),
    ),
  };
  const keys = {
    create: vi.fn(() => 'namespace:offline-training-lease:secret'),
  };
  const clock = { now: vi.fn(() => now) };
  let service: OfflineTrainingLeaseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OfflineTrainingLeaseService(
      redis as unknown as RedisClientService,
      keys as unknown as RedisKeyService,
      clock as unknown as TrainingClockService,
    );
  });

  it.each([
    ['created', false],
    ['unchanged', false],
    ['taken-over', true],
  ] as const)('returns the atomic %s transition', async (state, takeover) => {
    evalMock.mockResolvedValueOnce([state, JSON.stringify(lease)]);

    const result = takeover
      ? await service.takeover(personId, installationId)
      : await service.register(personId, installationId);

    expect(result).toEqual({
      expiresAt,
      leaseId: lease.leaseId,
      state,
    });
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'namespace:offline-training-lease:secret',
      installationId,
      String(Date.parse(expiresAt)),
      expect.any(String),
      takeover ? '1' : '0',
    );
  });

  it('requires explicit takeover without exposing the current tuple', async () => {
    evalMock.mockResolvedValueOnce(['takeover-required', '']);

    await expect(
      service.register(personId, installationId),
    ).rejects.toBeInstanceOf(OfflineTrainingLeaseTakeoverRequiredError);
  });

  it('validates the complete fence without renewing it', async () => {
    evalMock.mockResolvedValueOnce([1, JSON.stringify(lease)]);

    await expect(service.validate(lease)).resolves.toEqual(lease);
    expect(clock.now).not.toHaveBeenCalled();
  });

  it.each([
    [0, OfflineTrainingLeaseExpiredError],
    [-1, OfflineTrainingLeaseRevokedError],
  ])(
    'maps validation outcome %s to its domain error',
    async (outcome, ErrorType) => {
      evalMock.mockResolvedValueOnce([outcome, '']);

      await expect(service.validate(lease)).rejects.toBeInstanceOf(ErrorType);
    },
  );

  it('renews only after an accepted sync and keeps the complete fence', async () => {
    const renewed = { ...lease, expiresAt };
    evalMock.mockResolvedValueOnce([1, JSON.stringify(renewed)]);

    const result = await service.renewAfterAcceptedSync(lease);

    expect(result).toEqual(renewed);
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.any(String),
      personId,
      installationId,
      lease.leaseId,
      JSON.stringify(renewed),
      String(Date.parse(expiresAt)),
    );
  });

  it.each([
    [0, OfflineTrainingLeaseExpiredError],
    [-1, OfflineTrainingLeaseRevokedError],
  ])(
    'maps renewal outcome %s to its domain error',
    async (outcome, ErrorType) => {
      evalMock.mockResolvedValueOnce([outcome, '']);

      await expect(
        service.renewAfterAcceptedSync(lease),
      ).rejects.toBeInstanceOf(ErrorType);
    },
  );

  it.each([new RedisUnavailableError(), new Error('corrupt payload')])(
    'fails closed when Redis is unavailable or invalid',
    async (error) => {
      evalMock.mockRejectedValueOnce(error);

      await expect(
        service.register(personId, installationId),
      ).rejects.toBeInstanceOf(OfflineTrainingLeaseUnavailableError);
    },
  );

  it('fails closed on malformed script output and never logs lease identifiers', async () => {
    const logs: unknown[] = [];
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((...values: unknown[]) => {
        logs.push(values);
      });
    evalMock.mockResolvedValueOnce(['created', JSON.stringify(lease)]);

    await service.register(personId, installationId);
    const serializedLogs = JSON.stringify(logs);
    logSpy.mockRestore();

    expect(serializedLogs).not.toContain(personId);
    expect(serializedLogs).not.toContain(installationId);
    expect(serializedLogs).not.toContain(lease.leaseId);
    expect(serializedLogs).not.toContain('namespace:offline-training-lease');
  });

  it('rejects malformed Redis responses as unavailable', async () => {
    evalMock.mockResolvedValueOnce(['created']);

    await expect(
      service.register(personId, installationId),
    ).rejects.toBeInstanceOf(OfflineTrainingLeaseUnavailableError);
  });
});
