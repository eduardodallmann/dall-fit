import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { GetLivenessCommand } from '~/operational/commands/get-liveness.command';
import { GetReadinessCommand } from '~/operational/commands/get-readiness.command';
import { OperationalController } from '~/operational/controllers/operational.controller';
import { RedisHealthIndicator } from '~/operational/indicators/redis-health.indicator';
import { ReadinessService } from '~/operational/services/readiness.service';
import { RedisModule } from '~/redis/redis.module';

@Module({
  imports: [RedisModule, TerminusModule],
  controllers: [OperationalController],
  providers: [
    GetLivenessCommand,
    GetReadinessCommand,
    ReadinessService,
    RedisHealthIndicator,
  ],
})
export class OperationalModule {}
