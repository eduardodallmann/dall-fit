import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';

import { MongoHealthIndicator } from '~/operational/indicators/mongo-health.indicator';
import { RedisHealthIndicator } from '~/operational/indicators/redis-health.indicator';

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly mongoHealthIndicator: MongoHealthIndicator,
    private readonly redisHealthIndicator: RedisHealthIndicator,
  ) {}

  async check(): Promise<HealthCheckResult> {
    this.logger.log('ReadinessService -> check -> params:', {
      params: { indicatorNames: ['mongodb', 'redis'] },
    });
    const healthResult = await this.healthCheckService.check([
      () => this.mongoHealthIndicator.check(),
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
