import { describe, expect, it, vi } from 'vitest';

import { GetAndroidAppCompatibilityCommand } from '~/app-compatibility/commands/get-android-app-compatibility.command';
import type { AndroidAppCompatibilityService } from '~/app-compatibility/services/android-app-compatibility.service';

describe('GetAndroidAppCompatibilityCommand', () => {
  it('wraps the policy returned by the compatibility service', () => {
    const policy = {
      minimumVersionCode: 3,
      platform: 'android' as const,
      storeUrl: 'https://play.google.com/store/apps/details?id=com.dallfit.app',
      syncContractVersion: 1 as const,
    };
    const getPolicy = vi.fn().mockReturnValue(policy);
    const compatibility = {
      getPolicy,
    } as unknown as AndroidAppCompatibilityService;
    const command = new GetAndroidAppCompatibilityCommand(compatibility);

    expect(command.execute()).toEqual({ data: policy });
    expect(getPolicy).toHaveBeenCalledTimes(1);
  });
});
