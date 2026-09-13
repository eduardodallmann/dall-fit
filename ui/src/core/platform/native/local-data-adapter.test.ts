import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NativeLocalDataAdapter } from '~/core/platform/native/local-data-adapter';

function createPlugin() {
  return {
    bindAccount: vi.fn(() => Promise.resolve()),
    clearAccountData: vi.fn(() => Promise.resolve()),
    hasPendingChanges: vi.fn(() => Promise.resolve({ value: true })),
  };
}

describe('NativeLocalDataAdapter', () => {
  beforeEach(() => window.localStorage.clear());

  it('delegates account binding and cleanup to the native storage bridge', async () => {
    const plugin = createPlugin();
    const adapter = new NativeLocalDataAdapter(plugin);

    await adapter.bindAccount('person-a');
    window.localStorage.setItem('dall-fit:theme', 'dark');
    await adapter.clearAccountDataAtomically();

    expect(plugin.bindAccount).toHaveBeenCalledWith({ personId: 'person-a' });
    expect(plugin.clearAccountData).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('dall-fit:theme')).toBeNull();
  });

  it('reads pending state from the native engine', async () => {
    const plugin = createPlugin();
    const adapter = new NativeLocalDataAdapter(plugin);

    await expect(adapter.hasPendingChanges()).resolves.toBe(true);
    expect(plugin.hasPendingChanges).toHaveBeenCalledOnce();
  });
});
