import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NativeAppCompatibilityCoordinator } from '~/core/platform/native/app-compatibility';

const compatible = {
  installedVersionCode: 1,
  installedVersionName: '1.0',
  minimumVersionCode: 1,
  storeUrl: 'https://play.google.com/store/apps/details?id=com.dallfit.app',
  syncContractVersion: 1 as const,
  updateRequired: false,
};

function createPlugin() {
  return {
    acknowledgeRecovery: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    checkAppCompatibility: vi.fn().mockResolvedValue(compatible),
    getActiveSession: vi.fn().mockResolvedValue({}),
    getAppCompatibility: vi.fn().mockResolvedValue(compatible),
    getState: vi.fn().mockResolvedValue({ recovery: 'none' }),
    openAppStore: vi.fn().mockResolvedValue({ opened: true }),
  };
}

describe('NativeAppCompatibilityCoordinator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the package state and shares overlapping policy checks', async () => {
    let resolveCheck: ((value: typeof compatible) => void) | undefined;
    const plugin = createPlugin();
    plugin.checkAppCompatibility.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const coordinator = new NativeAppCompatibilityCoordinator(
      plugin,
      'https://api.example.test',
    );
    const initialization = coordinator.initialize();
    await vi.waitFor(() =>
      expect(plugin.checkAppCompatibility).toHaveBeenCalledTimes(1),
    );

    const overlapping = coordinator.check();
    expect(plugin.checkAppCompatibility).toHaveBeenCalledTimes(1);
    resolveCheck?.(compatible);
    await Promise.all([initialization, overlapping]);

    expect(coordinator.getSnapshot()).toMatchObject({
      checking: false,
      installedVersionCode: 1,
      updateRequired: false,
    });
  });

  it('fails open without a known minimum and keeps a known native block', async () => {
    const plugin = createPlugin();
    plugin.getAppCompatibility.mockResolvedValueOnce({
      ...compatible,
      minimumVersionCode: undefined,
      storeUrl: undefined,
    });
    plugin.checkAppCompatibility.mockRejectedValueOnce(new Error('offline'));
    const coordinator = new NativeAppCompatibilityCoordinator(plugin);
    await coordinator.initialize();
    expect(coordinator.getSnapshot().updateRequired).toBe(false);

    plugin.getAppCompatibility.mockResolvedValueOnce({
      ...compatible,
      minimumVersionCode: 2,
      updateRequired: true,
    });
    (plugin.addListener.mock.calls[0]?.[1] as (() => void) | undefined)?.();
    await vi.waitFor(() =>
      expect(coordinator.getSnapshot().updateRequired).toBe(true),
    );
  });

  it('opens only the store URL returned by the native state', async () => {
    const plugin = createPlugin();
    const coordinator = new NativeAppCompatibilityCoordinator(plugin);
    await coordinator.initialize();

    await expect(coordinator.openStore()).resolves.toBe(true);
    expect(plugin.openAppStore).toHaveBeenCalledWith({
      storeUrl: compatible.storeUrl,
    });
  });

  it('keeps a terminal store failure visible and repeatable', async () => {
    const plugin = createPlugin();
    plugin.openAppStore.mockRejectedValueOnce(new Error('unavailable'));
    const coordinator = new NativeAppCompatibilityCoordinator(plugin);
    await coordinator.initialize();

    await expect(coordinator.openStore()).resolves.toBe(false);
    expect(coordinator.getSnapshot().storeOpenFailed).toBe(true);

    await expect(coordinator.openStore()).resolves.toBe(true);
    expect(plugin.openAppStore).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot().storeOpenFailed).toBe(false);
  });

  it('ignores a delayed response after teardown and removes native listeners', async () => {
    let resolveCheck: ((value: typeof compatible) => void) | undefined;
    const remove = vi.fn().mockResolvedValue(undefined);
    const plugin = createPlugin();
    plugin.addListener.mockResolvedValue({ remove });
    plugin.checkAppCompatibility.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const coordinator = new NativeAppCompatibilityCoordinator(plugin);
    const initialization = coordinator.initialize();
    await vi.waitFor(() =>
      expect(plugin.checkAppCompatibility).toHaveBeenCalledTimes(1),
    );

    await coordinator.destroy();
    resolveCheck?.({
      ...compatible,
      minimumVersionCode: 2,
      updateRequired: true,
    });
    await initialization;

    expect(remove).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().updateRequired).toBe(false);
  });
});
