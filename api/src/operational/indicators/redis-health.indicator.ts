import { Injectable, Logger } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisUnavailableError } from '~/redis/redis.errors';

const REDIS_HEALTH_TIMEOUT_MS = 1_000;

@Injectable()
export class RedisHealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async check(): Promise<HealthIndicatorResult<'redis'>> {
    this.logger.log('RedisHealthIndicator -> check -> params:', {
      params: { timeoutMs: REDIS_HEALTH_TIMEOUT_MS },
    });
    const indicator = this.healthIndicatorService.check('redis');
    let timeout: NodeJS.Timeout | undefined;

    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new RedisUnavailableError());
        }, REDIS_HEALTH_TIMEOUT_MS);
        timeout.unref();
      });
      await Promise.race([this.redisClientService.ping(), timeoutPromise]);
      this.logger.log(
        'RedisHealthIndicator -> check -> redisClientService return:',
        { data: { ready: true } },
      );
      const result = indicator.up();
      this.logger.log('RedisHealthIndicator -> check -> return:', {
        data: result,
      });

      return result;
    } catch (error: unknown) {
      if (!(error instanceof RedisUnavailableError)) {
        throw error;
      }

      this.logger.warn('RedisHealthIndicator -> check -> unavailable branch:', {
        data: { ready: false },
      });
      const result = indicator.down();
      this.logger.log('RedisHealthIndicator -> check -> return:', {
        data: result,
      });

      return result;
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
