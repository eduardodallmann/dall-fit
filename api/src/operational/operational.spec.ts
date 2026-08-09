import type {
  HealthCheckResult,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetLivenessCommand } from '~/operational/commands/get-liveness.command';
import { GetReadinessCommand } from '~/operational/commands/get-readiness.command';
import { OperationalController } from '~/operational/controllers/operational.controller';
import { RedisHealthIndicator } from '~/operational/indicators/redis-health.indicator';
import { ReadinessService } from '~/operational/services/readiness.service';
import type { RedisClientService } from '~/redis/redis-client.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

describe('operational probes', () => {
  const successfulHealthResult: HealthCheckResult = {
    details: {
      mongodb: { status: 'up' },
      redis: { status: 'up' },
    },
    info: {
      mongodb: { status: 'up' },
      redis: { status: 'up' },
    },
    status: 'ok',
  };

  it('returns a static liveness result through controller and command', () => {
    const livenessCommand = new GetLivenessCommand();
    const readinessCommand = {
      execute: vi.fn(),
    } as unknown as GetReadinessCommand;
    const controller = new OperationalController(
      livenessCommand,
      readinessCommand,
    );

    expect(controller.getLiveness()).toEqual({ status: 'ok' });
  });

  it('returns readiness through controller, command and service', async () => {
    const healthCheckService = {
      check: vi.fn(async (checks: Array<() => Promise<unknown>>) => {
        await Promise.all(checks.map((check) => check()));
        return successfulHealthResult;
      }),
    };
    const mongooseHealthIndicator = {
      pingCheck: vi.fn().mockResolvedValue({ mongodb: { status: 'up' } }),
    };
    const redisHealthIndicator = {
      check: vi.fn().mockResolvedValue({ redis: { status: 'up' } }),
    };
    const service = new ReadinessService(
      healthCheckService as unknown as HealthCheckService,
      mongooseHealthIndicator as unknown as MongooseHealthIndicator,
      redisHealthIndicator as unknown as RedisHealthIndicator,
    );
    const command = new GetReadinessCommand(service);
    const controller = new OperationalController(
      new GetLivenessCommand(),
      command,
    );

    await expect(controller.getReadiness()).resolves.toBe(
      successfulHealthResult,
    );
    expect(mongooseHealthIndicator.pingCheck).toHaveBeenCalledWith('mongodb', {
      timeout: 1_000,
    });
    expect(redisHealthIndicator.check).toHaveBeenCalledOnce();
  });
});

describe('RedisHealthIndicator', () => {
  const up = vi.fn().mockReturnValue({ redis: { status: 'up' } });
  const down = vi.fn().mockReturnValue({ redis: { status: 'down' } });
  const healthIndicatorService = {
    check: vi.fn().mockReturnValue({ down, up }),
  };
  const redisClientService = { ping: vi.fn() };
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    vi.clearAllMocks();
    redisClientService.ping.mockResolvedValue(undefined);
    indicator = new RedisHealthIndicator(
      redisClientService as unknown as RedisClientService,
      healthIndicatorService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the existing Redis client as up after PING', async () => {
    await expect(indicator.check()).resolves.toEqual({
      redis: { status: 'up' },
    });
    expect(redisClientService.ping).toHaveBeenCalledOnce();
    expect(up).toHaveBeenCalledOnce();
  });

  it('marks a translated Redis unavailability as down', async () => {
    redisClientService.ping.mockRejectedValue(new RedisUnavailableError());

    await expect(indicator.check()).resolves.toEqual({
      redis: { status: 'down' },
    });
    expect(down).toHaveBeenCalledOnce();
  });

  it('marks Redis as down when PING exceeds the health timeout', async () => {
    vi.useFakeTimers();
    redisClientService.ping.mockReturnValue(new Promise(() => undefined));

    const result = indicator.check();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({ redis: { status: 'down' } });
    expect(down).toHaveBeenCalledOnce();
  });

  it('propagates an unexpected indicator error', async () => {
    const error = new Error('unexpected');
    redisClientService.ping.mockRejectedValue(error);

    await expect(indicator.check()).rejects.toBe(error);
  });
});
