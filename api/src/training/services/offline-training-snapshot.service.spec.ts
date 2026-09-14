import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PutOfflineTrainingSnapshotV1Request } from '@dall-fit/types';

import type { RedisClientService } from '~/redis/redis-client.service';
import type { RedisKeyService } from '~/redis/redis-key.service';
import { RedisUnavailableError } from '~/redis/redis.errors';
import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
} from '~/training/errors/offline-training-lease.errors';
import {
  OfflineTrainingExecutionConflictError,
  OfflineTrainingSnapshotIdempotencyConflictError,
  OfflineTrainingSnapshotStaleError,
  OfflineTrainingSnapshotUnavailableError,
} from '~/training/errors/offline-training-snapshot.errors';
import { OfflineTrainingSnapshotService } from '~/training/services/offline-training-snapshot.service';
import type { TrainingClockService } from '~/training/services/training-clock.service';

describe('OfflineTrainingSnapshotService', () => {
  const now = new Date('2026-09-14T12:10:00.000Z');
  const request = {
    clientUpdatedAt: '2026-09-14T12:05:00.000Z',
    executionId: '11111111-1111-4111-8111-111111111111',
    installationId: '22222222-2222-4222-8222-222222222222',
    leaseId: '33333333-3333-4333-8333-333333333333',
    payloadVersion: 1,
    revision: 0,
    snapshot: {
      activeTimer: null,
      plan: { planId: '64b000000000000000000001' },
      startedAt: '2026-09-14T12:00:00.000Z',
      workout: {},
    },
  } as unknown as PutOfflineTrainingSnapshotV1Request;
  const evalMock = vi.fn();
  const client = { eval: evalMock } as unknown as Redis;
  const redis = {
    execute: vi.fn(async (operation: (value: Redis) => Promise<unknown>) =>
      operation(client),
    ),
  };
  const keys = {
    create: vi.fn((subject: string) => `namespace:${subject}:hidden`),
  };
  const clock = { now: vi.fn(() => now) };
  let service: OfflineTrainingSnapshotService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OfflineTrainingSnapshotService(
      redis as unknown as RedisClientService,
      keys as unknown as RedisKeyService,
      clock as unknown as TrainingClockService,
    );
  });

  it.each(['accepted', 'duplicate'] as const)(
    'returns persisted canonical metadata for %s',
    async (state) => {
      evalMock.mockResolvedValueOnce([
        state,
        String(now.getTime()),
        String(Date.parse(request.clientUpdatedAt)),
        String(now.getTime() + 604_800_000),
      ]);
      const result = await service.ingest({
        contentHash: 'hidden-hash',
        personId: 'hidden-person',
        request,
        serializedSnapshot: '{}',
      });
      expect(result).toMatchObject({
        executionId: request.executionId,
        revision: 0,
        state,
      });
      expect(evalMock).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('PEXPIREAT', KEYS[2]"),
        2,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        request.snapshot.plan.planId,
        request.installationId,
        request.leaseId,
        request.executionId,
        '0',
        'hidden-hash',
        request.clientUpdatedAt,
        String(Date.parse(request.clientUpdatedAt)),
        String(now.getTime()),
        String(now.getTime() + 604_800_000),
        '2026-09-21T12:10:00.000Z',
        '{}',
      );
    },
  );

  it.each([
    ['lease-expired', OfflineTrainingLeaseExpiredError],
    ['lease-revoked', OfflineTrainingLeaseRevokedError],
    ['stale', OfflineTrainingSnapshotStaleError],
    ['idempotency-conflict', OfflineTrainingSnapshotIdempotencyConflictError],
    ['execution-conflict', OfflineTrainingExecutionConflictError],
  ] as const)(
    'maps %s without declaring acceptance',
    async (state, ErrorType) => {
      evalMock.mockResolvedValueOnce([state, '', '', '']);
      await expect(
        service.ingest({
          contentHash: 'hidden-hash',
          personId: 'hidden-person',
          request,
          serializedSnapshot: '{}',
        }),
      ).rejects.toBeInstanceOf(ErrorType);
    },
  );

  it.each([new RedisUnavailableError(), new Error('invalid-response')])(
    'fails closed on technical or malformed Redis responses',
    async (failure) => {
      evalMock.mockRejectedValueOnce(failure);
      await expect(
        service.ingest({
          contentHash: 'hidden-hash',
          personId: 'hidden-person',
          request,
          serializedSnapshot: '{}',
        }),
      ).rejects.toBeInstanceOf(OfflineTrainingSnapshotUnavailableError);
    },
  );
});
