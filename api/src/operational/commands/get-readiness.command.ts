import { Injectable, Logger } from '@nestjs/common';
import type { HealthCheckResult } from '@nestjs/terminus';

import { ReadinessService } from '~/operational/services/readiness.service';

@Injectable()
export class GetReadinessCommand {
  private readonly logger = new Logger(GetReadinessCommand.name);

  constructor(private readonly readinessService: ReadinessService) {}

  async execute(): Promise<HealthCheckResult> {
    this.logger.log('GetReadinessCommand -> execute -> params:', {
      params: {},
    });
    const readinessResult = await this.readinessService.check();
    this.logger.log(
      'GetReadinessCommand -> execute -> readinessService return:',
      { data: { status: readinessResult.status } },
    );
    const result = readinessResult;
    this.logger.log('GetReadinessCommand -> execute -> return:', {
      data: { status: result.status },
    });

    return result;
  }
}
