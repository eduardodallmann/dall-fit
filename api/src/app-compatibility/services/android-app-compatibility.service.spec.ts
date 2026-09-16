import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { AppUpdateRequiredError } from '~/app-compatibility/errors/app-update-required.error';
import { AndroidAppCompatibilityService } from '~/app-compatibility/services/android-app-compatibility.service';

describe('AndroidAppCompatibilityService', () => {
  function service(minimumVersionCode = 1) {
    const config = new ConfigService({
      ANDROID_MIN_VERSION_CODE: minimumVersionCode,
      ANDROID_PLAY_STORE_URL:
        'https://play.google.com/store/apps/details?id=com.dallfit.app',
    });
    return new AndroidAppCompatibilityService(config);
  }

  it('publishes the exact Android policy', () => {
    expect(service(2).getPolicy()).toEqual({
      minimumVersionCode: 2,
      platform: 'android',
      storeUrl: 'https://play.google.com/store/apps/details?id=com.dallfit.app',
      syncContractVersion: 1,
    });
  });

  it('accepts legacy absence only while baseline one remains compatible', () => {
    expect(() => service().validateSnapshotClient({})).not.toThrow();
    expect(() => service(2).validateSnapshotClient({})).toThrow(
      AppUpdateRequiredError,
    );
  });

  it.each([
    { appVersionCode: '1', syncContractVersion: '1' },
    { appVersionCode: '2', syncContractVersion: '2' },
    { appVersionCode: 'invalid', syncContractVersion: '1' },
    { appVersionCode: '2' },
  ])('rejects incompatible or malformed headers %#', (headers) => {
    try {
      service(2).validateSnapshotClient(headers);
      throw new Error('Expected compatibility validation to fail.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppUpdateRequiredError);
      expect((error as AppUpdateRequiredError).details).toEqual({
        minimumVersionCode: 2,
        storeUrl:
          'https://play.google.com/store/apps/details?id=com.dallfit.app',
        syncContractVersion: 1,
      });
    }
  });

  it('accepts newer app builds using the current sync contract', () => {
    expect(() =>
      service(2).validateSnapshotClient({
        appVersionCode: '3',
        syncContractVersion: '1',
      }),
    ).not.toThrow();
  });
});
