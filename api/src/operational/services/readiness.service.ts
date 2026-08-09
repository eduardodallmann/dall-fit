import { Injectable, Logger } from '@nestjs/common';
import {
  HealthCheckService,
  MongooseHealthIndicator,
  type HealthCheckResult,
} from '@nestjs/terminus';

import { RedisHealthIndicator } from '~/operational/indicators/redis-health.indicator';

const MONGODB_HEALTH_TIMEOUT_MS = 1_000;

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly mongooseHealthIndicator: MongooseHealthIndicator,
    private readonly redisHealthIndicator: RedisHealthIndicator,
  ) {}

  async check(): Promise<HealthCheckResult> {
    this.logger.log('ReadinessService -> check -> params:', {
      params: { mongodbTimeoutMs: MONGODB_HEALTH_TIMEOUT_MS },
    });
    const healthResult = await this.healthCheckService.check([
      () =>
        this.mongooseHealthIndicator.pingCheck('mongodb', {
          timeout: MONGODB_HEALTH_TIMEOUT_MS,
        }),
      () => this.redisHealthIndicator.check(),
    ]);
    this.logger.log('ReadinessService -> check -> healthCheckService return:', {
      data: {
        indicatorNames: Object.keys(healthResult.details),
        status: healthResult.status,
      },
    });
    const result = healthResult;
    this.logger.log('ReadinessService -> check -> return:', {
      data: { status: result.status },
    });

    return result;
  }
}
