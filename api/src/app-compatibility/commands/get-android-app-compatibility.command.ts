import { Injectable, Logger } from '@nestjs/common';

import type { AndroidAppCompatibilityResponse } from '@dall-fit/types';

import { AndroidAppCompatibilityService } from '~/app-compatibility/services/android-app-compatibility.service';

@Injectable()
export class GetAndroidAppCompatibilityCommand {
  private readonly logger = new Logger(GetAndroidAppCompatibilityCommand.name);

  constructor(private readonly compatibility: AndroidAppCompatibilityService) {}

  execute(): AndroidAppCompatibilityResponse {
    this.logger.log('GetAndroidAppCompatibilityCommand -> execute -> params:', {
      params: {},
    });
    const policy = this.compatibility.getPolicy();
    this.logger.log(
      'GetAndroidAppCompatibilityCommand -> execute -> compatibility return:',
      {
        data: {
          minimumVersionCode: policy.minimumVersionCode,
          syncContractVersion: policy.syncContractVersion,
        },
      },
    );
    const result = { data: policy };
    this.logger.log('GetAndroidAppCompatibilityCommand -> execute -> return:', {
      data: {
        minimumVersionCode: policy.minimumVersionCode,
        platform: policy.platform,
        syncContractVersion: policy.syncContractVersion,
      },
    });
    return result;
  }
}
