import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ANDROID_SYNC_CONTRACT_VERSION,
  type AndroidAppCompatibility,
  type AppUpdateRequiredDetails,
} from '@dall-fit/types';

import { AppUpdateRequiredError } from '~/app-compatibility/errors/app-update-required.error';

export interface AndroidSnapshotClientHeaders {
  appVersionCode?: string;
  syncContractVersion?: string;
}

@Injectable()
export class AndroidAppCompatibilityService {
  private readonly logger = new Logger(AndroidAppCompatibilityService.name);

  constructor(private readonly configService: ConfigService) {}

  getPolicy(): AndroidAppCompatibility {
    this.logger.log('AndroidAppCompatibilityService -> getPolicy -> params:', {
      params: {},
    });
    const result: AndroidAppCompatibility = {
      minimumVersionCode: this.configService.getOrThrow<number>(
        'ANDROID_MIN_VERSION_CODE',
      ),
      platform: 'android',
      storeUrl: this.configService.getOrThrow<string>('ANDROID_PLAY_STORE_URL'),
      syncContractVersion: ANDROID_SYNC_CONTRACT_VERSION,
    };
    this.logger.log('AndroidAppCompatibilityService -> getPolicy -> return:', {
      data: {
        minimumVersionCode: result.minimumVersionCode,
        platform: result.platform,
        syncContractVersion: result.syncContractVersion,
      },
    });
    return result;
  }

  validateSnapshotClient(headers: AndroidSnapshotClientHeaders): void {
    this.logger.log(
      'AndroidAppCompatibilityService -> validateSnapshotClient -> params:',
      {
        params: {
          appVersionCodePresent: headers.appVersionCode !== undefined,
          syncContractVersionPresent: headers.syncContractVersion !== undefined,
        },
      },
    );
    const policy = this.getPolicy();
    this.logger.log(
      'AndroidAppCompatibilityService -> validateSnapshotClient -> getPolicy return:',
      {
        data: {
          minimumVersionCode: policy.minimumVersionCode,
          syncContractVersion: policy.syncContractVersion,
        },
      },
    );
    const bothAbsent =
      headers.appVersionCode === undefined &&
      headers.syncContractVersion === undefined;
    const appVersionCode = bothAbsent
      ? 1
      : parsePositiveInteger(headers.appVersionCode);
    const syncContractVersion = bothAbsent
      ? ANDROID_SYNC_CONTRACT_VERSION
      : parsePositiveInteger(headers.syncContractVersion);
    const compatible =
      appVersionCode !== null &&
      syncContractVersion !== null &&
      appVersionCode >= policy.minimumVersionCode &&
      syncContractVersion === policy.syncContractVersion;

    if (!compatible) {
      const details = toRequiredDetails(policy);
      this.logger.warn(
        'AndroidAppCompatibilityService -> validateSnapshotClient -> updateRequired branch:',
        {
          data: {
            appVersionCode,
            minimumVersionCode: policy.minimumVersionCode,
            syncContractVersion,
          },
        },
      );
      throw new AppUpdateRequiredError(details);
    }

    this.logger.log(
      'AndroidAppCompatibilityService -> validateSnapshotClient -> completed:',
      {
        data: {
          appVersionCode,
          classification: 'compatible',
          syncContractVersion,
        },
      },
    );
  }
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  const result = Number.isSafeInteger(parsed) ? parsed : null;
  return result;
}

function toRequiredDetails(
  policy: AndroidAppCompatibility,
): AppUpdateRequiredDetails {
  const result = {
    minimumVersionCode: policy.minimumVersionCode,
    storeUrl: policy.storeUrl,
    syncContractVersion: policy.syncContractVersion,
  };
  return result;
}
