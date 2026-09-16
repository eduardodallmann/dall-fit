import { Controller, Get, Header, Logger, UseGuards } from '@nestjs/common';

import type { AndroidAppCompatibilityResponse } from '@dall-fit/types';

import { GetAndroidAppCompatibilityCommand } from '~/app-compatibility/commands/get-android-app-compatibility.command';
import { AndroidAppCompatibilityRateLimitGuard } from '~/app-compatibility/guards/android-app-compatibility-rate-limit.guard';

@Controller('app-compatibility')
export class AppCompatibilityController {
  private readonly logger = new Logger(AppCompatibilityController.name);

  constructor(private readonly command: GetAndroidAppCompatibilityCommand) {}

  @Get('android')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AndroidAppCompatibilityRateLimitGuard)
  getAndroid(): AndroidAppCompatibilityResponse {
    this.logger.log('AppCompatibilityController -> getAndroid -> params:', {
      params: {},
    });
    const result = this.command.execute();
    this.logger.log(
      'AppCompatibilityController -> getAndroid -> command return:',
      {
        data: {
          minimumVersionCode: result.data.minimumVersionCode,
          syncContractVersion: result.data.syncContractVersion,
        },
      },
    );
    this.logger.log('AppCompatibilityController -> getAndroid -> return:', {
      data: {
        minimumVersionCode: result.data.minimumVersionCode,
        platform: result.data.platform,
        syncContractVersion: result.data.syncContractVersion,
      },
    });
    return result;
  }
}
