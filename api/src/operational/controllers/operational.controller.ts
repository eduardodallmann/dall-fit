import { Controller, Get, Logger } from '@nestjs/common';
import { HealthCheck, type HealthCheckResult } from '@nestjs/terminus';

import {
  GetLivenessCommand,
  type LivenessResponse,
} from '~/operational/commands/get-liveness.command';
import { GetReadinessCommand } from '~/operational/commands/get-readiness.command';

@Controller()
export class OperationalController {
  private readonly logger = new Logger(OperationalController.name);

  constructor(
    private readonly getLivenessCommand: GetLivenessCommand,
    private readonly getReadinessCommand: GetReadinessCommand,
  ) {}

  @Get('health')
  getLiveness(): LivenessResponse {
    this.logger.log('OperationalController -> getLiveness -> params:', {
      params: {},
    });
    const commandResult = this.getLivenessCommand.execute();
    this.logger.log(
      'OperationalController -> getLiveness -> getLivenessCommand return:',
      { data: commandResult },
    );
    const result = commandResult;
    this.logger.log('OperationalController -> getLiveness -> return:', {
      data: result,
    });

    return result;
  }

  @Get('ready')
  @HealthCheck()
  async getReadiness(): Promise<HealthCheckResult> {
    this.logger.log('OperationalController -> getReadiness -> params:', {
      params: {},
    });
    const commandResult = await this.getReadinessCommand.execute();
    this.logger.log(
      'OperationalController -> getReadiness -> getReadinessCommand return:',
      { data: { status: commandResult.status } },
    );
    const result = commandResult;
    this.logger.log('OperationalController -> getReadiness -> return:', {
      data: { status: result.status },
    });

    return result;
  }
}
