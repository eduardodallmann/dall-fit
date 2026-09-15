import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NativeSessionCoordinator } from '~/auth/native-session';
import type {
  OfflineStoragePlugin,
  OfflineSyncState,
} from '~/core/platform/native/offline-storage-plugin';
import { OfflineSyncCoordinator } from '~/core/platform/native/offline-sync';

const idleState: OfflineSyncState = {
  actionRequired: false,
  pendingCount: 0,
  revision: 1,
  state: 'idle',
};

function createHarness() {
  let accessToken: string | undefined = 'native-token';
  let credentialListener: ((value: string | undefined) => void) | undefined;
  let stateListener: ((state: OfflineSyncState) => void) | undefined;
  const expireSession = vi.fn(() => Promise.resolve());
  const session = {
    addCredentialListener: vi.fn(
      (listener: (value: string | undefined) => void) => {
        credentialListener = listener;
        listener(accessToken);
        return () => {
          credentialListener = undefined;
        };
      },
    ),
    expireSession,
    getAccessToken: vi.fn(() => Promise.resolve(accessToken)),
  } as unknown as NativeSessionCoordinator;
  const remove = vi.fn(() => Promise.resolve());
  const triggerSync = vi.fn(() => Promise.resolve(idleState));
  const clearSyncCredentials = vi.fn(() => Promise.resolve(idleState));
  const plugin = {
    addListener: vi.fn(
      (_eventName: string, listener: (state: OfflineSyncState) => void) => {
        stateListener = listener;
        return Promise.resolve({ remove });
      },
    ),
    clearSyncCredentials,
    getSyncState: vi.fn(() => Promise.resolve(idleState)),
    triggerSync,
  } as unknown as OfflineStoragePlugin;

  return {
    clearSyncCredentials,
    coordinator: new OfflineSyncCoordinator(
      session,
      plugin,
      'https://api.example.com/',
    ),
    expireSession,
    remove,
    setCredential(value: string | undefined) {
      accessToken = value;
      credentialListener?.(value);
    },
    state(value: OfflineSyncState) {
      stateListener?.(value);
    },
    triggerSync,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OfflineSyncCoordinator', () => {
  it('passes the Bearer only in memory and retriggers on resume', async () => {
    const harness = createHarness();
    await harness.coordinator.initialize();

    await vi.waitFor(() =>
      expect(harness.triggerSync).toHaveBeenCalledWith({
        accessToken: 'native-token',
        apiBaseUrl: 'https://api.example.com',
        rearmTemporary: true,
      }),
    );

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() =>
      expect(harness.triggerSync).toHaveBeenCalledTimes(3),
    );

    await harness.coordinator.destroy();
    expect(harness.remove).toHaveBeenCalledOnce();
    expect(harness.clearSyncCredentials).toHaveBeenCalled();
  });

  it('clears native credentials when the session disappears', async () => {
    const harness = createHarness();
    await harness.coordinator.initialize();

    harness.setCredential(undefined);

    await vi.waitFor(() =>
      expect(harness.clearSyncCredentials).toHaveBeenCalled(),
    );
    await harness.coordinator.destroy();
  });

  it('expires the React session when native synchronization receives 401', async () => {
    const harness = createHarness();
    await harness.coordinator.initialize();

    harness.state({
      actionRequired: false,
      pendingCount: 2,
      revision: 2,
      state: 'authentication-required',
    });

    await vi.waitFor(() =>
      expect(harness.expireSession).toHaveBeenCalledOnce(),
    );
    await harness.coordinator.destroy();
  });
});
