import { describe, expect, it, vi } from 'vitest';

import { CapacitorPlatformAdapter } from '~/core/platform/native/capacitor-platform-adapter';
import {
  createPlatformSnapshot,
  type OptionalPlatformAdapter,
  type PlatformAdapter,
} from '~/core/platform/platform';
import { resolveApplicationPlatform } from '~/core/platform/platform-composition';
import { WebPlatformAdapter } from '~/core/platform/web-platform-adapter';

describe('platform composition', () => {
  it('detects the Android native runtime through the Capacitor adapter', () => {
    const adapter = new CapacitorPlatformAdapter({
      getPlatform: () => 'android',
      isNativePlatform: () => true,
    });

    expect(resolveApplicationPlatform(adapter)).toEqual({
      capabilities: {
        nativeAuthentication: true,
        nativeBridge: true,
        nativeOfflineStorage: true,
      },
      platform: 'android',
    });
  });

  it.each([
    { isNative: false, platform: 'web' },
    { isNative: true, platform: 'ios' },
    { isNative: true, platform: 'unexpected' },
  ])(
    'uses the deterministic Web fallback for $platform with native=$isNative',
    ({ isNative, platform }) => {
      const adapter = new CapacitorPlatformAdapter({
        getPlatform: () => platform,
        isNativePlatform: () => isNative,
      });

      expect(resolveApplicationPlatform(adapter)).toEqual({
        capabilities: {
          nativeAuthentication: false,
          nativeBridge: false,
          nativeOfflineStorage: false,
        },
        platform: 'web',
      });
    },
  );

  it('selects injected adapters without reading the real runtime', () => {
    const nativeGetSnapshot = vi.fn(() => null);
    const nativeAdapter: OptionalPlatformAdapter = {
      getSnapshot: nativeGetSnapshot,
    };
    const webSnapshot = createPlatformSnapshot('web', false);
    const webGetSnapshot = vi.fn(() => webSnapshot);
    const webAdapter: PlatformAdapter = {
      getSnapshot: webGetSnapshot,
    };

    expect(resolveApplicationPlatform(nativeAdapter, webAdapter)).toBe(
      webSnapshot,
    );
    expect(nativeGetSnapshot).toHaveBeenCalledOnce();
    expect(webGetSnapshot).toHaveBeenCalledOnce();
  });

  it('returns deeply immutable capability snapshots', () => {
    const snapshot = new WebPlatformAdapter().getSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.capabilities)).toBe(true);
  });
});
