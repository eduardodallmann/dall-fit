import { describe, expect, it, vi } from 'vitest';

import type { GetAndroidAppCompatibilityCommand } from '~/app-compatibility/commands/get-android-app-compatibility.command';
import { AppCompatibilityController } from '~/app-compatibility/controllers/app-compatibility.controller';

describe('AppCompatibilityController', () => {
  it('returns the command response unchanged', () => {
    const response = {
      data: {
        minimumVersionCode: 1,
        platform: 'android' as const,
        storeUrl:
          'https://play.google.com/store/apps/details?id=com.dallfit.app',
        syncContractVersion: 1 as const,
      },
    };
    const execute = vi.fn().mockReturnValue(response);
    const command = { execute } as unknown as GetAndroidAppCompatibilityCommand;
    const controller = new AppCompatibilityController(command);

    expect(controller.getAndroid()).toBe(response);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
