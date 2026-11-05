import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Logger,
  Put,
} from '@nestjs/common';

import type {
  PutOfflineTrainingSnapshotResponse,
  PutOfflineTrainingSnapshotV1Request,
} from '@dall-fit/types';

import { NativeTrainingMutation } from '~/auth/decorators/authenticated-mutation';
import { CurrentPerson } from '~/auth/decorators/current-person';
import type { PersonEntity } from '~/person/domain/person.entity';
import { TermsExempt } from '~/terms/terms-policy';
import { PutOfflineTrainingSnapshotCommand } from '~/training/commands/put-offline-training-snapshot.command';
import { OfflineTrainingSnapshotValidationPipe } from '~/training/dto/offline-training-snapshot.dto';

@Controller('training/offline-snapshot')
@TermsExempt()
export class OfflineTrainingSnapshotController {
  private readonly logger = new Logger(OfflineTrainingSnapshotController.name);

  constructor(private readonly command: PutOfflineTrainingSnapshotCommand) {}

  @Put()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @NativeTrainingMutation()
  async put(
    @CurrentPerson() person: PersonEntity,
    @Body(OfflineTrainingSnapshotValidationPipe)
    body: PutOfflineTrainingSnapshotV1Request,
    @Headers('x-app-version-code') appVersionCode?: string,
    @Headers('x-sync-contract-version') syncContractVersion?: string,
  ): Promise<PutOfflineTrainingSnapshotResponse> {
    this.logger.log('OfflineTrainingSnapshotController -> put -> params:', {
      params: {
        appVersionCodePresent: appVersionCode !== undefined,
        payloadVersion: body.payloadVersion,
        syncContractVersionPresent: syncContractVersion !== undefined,
      },
    });
    const result = await this.command.execute(person.id, body, {
      appVersionCode,
      syncContractVersion,
    });
    this.logger.log(
      'OfflineTrainingSnapshotController -> put -> command return:',
      { data: { state: result.data.state } },
    );
    this.logger.log('OfflineTrainingSnapshotController -> put -> return:', {
      data: { state: result.data.state },
    });
    return result;
  }
}
