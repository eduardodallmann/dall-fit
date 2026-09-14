import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
  Put,
} from '@nestjs/common';

import { NativeTrainingLifecycleMutation } from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type { PersonEntity } from '~/person/domain/person.entity';
import { RegisterOfflineTrainingLeaseCommand } from '~/training/commands/register-offline-training-lease.command';
import { TakeoverOfflineTrainingLeaseCommand } from '~/training/commands/takeover-offline-training-lease.command';
import type { OfflineTrainingLeaseResponse } from '~/training/domain/offline-training-lease.types';
import { OfflineTrainingLeaseDto } from '~/training/dto/offline-training-lease.dto';

@Controller('training/offline-lease')
export class OfflineTrainingLeaseController {
  private readonly logger = new Logger(OfflineTrainingLeaseController.name);

  constructor(
    private readonly registerCommand: RegisterOfflineTrainingLeaseCommand,
    private readonly takeoverCommand: TakeoverOfflineTrainingLeaseCommand,
  ) {}

  @Put()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @NativeTrainingLifecycleMutation()
  async register(
    @CurrentPerson() person: PersonEntity,
    @Body() body: OfflineTrainingLeaseDto,
  ): Promise<OfflineTrainingLeaseResponse> {
    this.logger.log('OfflineTrainingLeaseController -> register -> params:', {
      params: { operation: 'register' },
    });
    const result = await this.registerCommand.execute(
      person.id,
      body.installationId,
    );
    this.logger.log(
      'OfflineTrainingLeaseController -> register -> registerCommand return:',
      { data: { state: result.data.state } },
    );
    this.logger.log('OfflineTrainingLeaseController -> register -> return:', {
      data: { state: result.data.state },
    });
    return result;
  }

  @Post('takeover')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @NativeTrainingLifecycleMutation()
  async takeover(
    @CurrentPerson() person: PersonEntity,
    @Body() body: OfflineTrainingLeaseDto,
  ): Promise<OfflineTrainingLeaseResponse> {
    this.logger.log('OfflineTrainingLeaseController -> takeover -> params:', {
      params: { operation: 'takeover' },
    });
    const result = await this.takeoverCommand.execute(
      person.id,
      body.installationId,
    );
    this.logger.log(
      'OfflineTrainingLeaseController -> takeover -> takeoverCommand return:',
      { data: { state: result.data.state } },
    );
    this.logger.log('OfflineTrainingLeaseController -> takeover -> return:', {
      data: { state: result.data.state },
    });
    return result;
  }
}
