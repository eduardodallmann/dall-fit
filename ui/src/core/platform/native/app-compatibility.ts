import type { PluginListenerHandle } from '@capacitor/core';

import { isBrowserOnline, subscribeToConnectivity } from '~/core/connectivity';
import {
  offlineStoragePlugin,
  type AppCompatibilityState,
  type OfflineStoragePlugin,
} from '~/core/platform/native/offline-storage-plugin';

type CompatibilityPlugin = Pick<
  OfflineStoragePlugin,
  | 'addListener'
  | 'acknowledgeRecovery'
  | 'checkAppCompatibility'
  | 'getActiveSession'
  | 'getAppCompatibility'
  | 'getState'
  | 'openAppStore'
>;

export interface NativeAppCompatibilitySnapshot extends AppCompatibilityState {
  activeWorkoutId?: string;
  checking: boolean;
  recoveryRequired: boolean;
  storeOpenFailed: boolean;
}

const unknownSnapshot: NativeAppCompatibilitySnapshot = {
  checking: true,
  installedVersionCode: 0,
  installedVersionName: '',
  recoveryRequired: false,
  storeOpenFailed: false,
  syncContractVersion: 1,
  updateRequired: false,
};

export class NativeAppCompatibilityCoordinator {
  private readonly apiBaseUrl: string;
  private connectivityCleanup: (() => void) | undefined;
  private generation = 0;
  private inFlight: Promise<void> | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly plugin: CompatibilityPlugin;
  private stateListener: PluginListenerHandle | undefined;
  private snapshot = unknownSnapshot;

  constructor(
    plugin: CompatibilityPlugin = offlineStoragePlugin,
    apiBaseUrl: string = import.meta.env.VITE_API_URL,
  ) {
    this.plugin = plugin;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  async initialize(): Promise<void> {
    const generation = ++this.generation;
    const [local, activeWorkoutId, storage] = await Promise.all([
      this.plugin.getAppCompatibility(),
      this.readActiveWorkoutId(),
      this.plugin.getState(),
    ]);
    if (generation !== this.generation) return;
    this.publish({
      ...local,
      activeWorkoutId,
      checking: false,
      recoveryRequired: storage.recovery === 'migration-reset',
      storeOpenFailed: false,
    });
    this.stateListener = await this.plugin.addListener('stateChanged', () => {
      void this.refreshLocal(generation);
    });
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.connectivityCleanup = subscribeToConnectivity(() => {
      if (isBrowserOnline()) void this.check();
    });
    await this.check();
  }

  getSnapshot = (): NativeAppCompatibilitySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  check(): Promise<void> {
    if (this.inFlight !== undefined) return this.inFlight;
    const generation = this.generation;
    this.publish({ ...this.snapshot, checking: true });
    const operation = this.plugin
      .checkAppCompatibility({ apiBaseUrl: this.apiBaseUrl })
      .then(async (state) => {
        const activeWorkoutId = await this.readActiveWorkoutId();
        if (generation !== this.generation) return;
        this.publish({
          ...state,
          activeWorkoutId,
          checking: false,
          recoveryRequired: this.snapshot.recoveryRequired,
          storeOpenFailed: false,
        });
      })
      .catch(() => {
        if (generation !== this.generation) return;
        this.publish({ ...this.snapshot, checking: false });
      })
      .finally(() => {
        if (this.inFlight === operation) this.inFlight = undefined;
      });
    this.inFlight = operation;
    return operation;
  }

  async openStore(): Promise<boolean> {
    if (this.snapshot.storeUrl === undefined) return false;
    try {
      const result = await this.plugin.openAppStore({
        storeUrl: this.snapshot.storeUrl,
      });
      this.publish({ ...this.snapshot, storeOpenFailed: !result.opened });
      return result.opened;
    } catch {
      this.publish({ ...this.snapshot, storeOpenFailed: true });
      return false;
    }
  }

  async acknowledgeRecovery(): Promise<void> {
    await this.plugin.acknowledgeRecovery();
    this.publish({ ...this.snapshot, recoveryRequired: false });
  }

  async destroy(): Promise<void> {
    ++this.generation;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.connectivityCleanup?.();
    this.connectivityCleanup = undefined;
    await this.stateListener?.remove();
    this.stateListener = undefined;
    this.listeners.clear();
  }

  private readonly handleVisibility = () => {
    if (document.visibilityState === 'visible') void this.check();
  };

  private async refreshLocal(generation: number): Promise<void> {
    const [state, activeWorkoutId, storage] = await Promise.all([
      this.plugin.getAppCompatibility(),
      this.readActiveWorkoutId(),
      this.plugin.getState(),
    ]);
    if (generation !== this.generation) return;
    this.publish({
      ...state,
      activeWorkoutId,
      checking: this.snapshot.checking,
      recoveryRequired: storage.recovery === 'migration-reset',
      storeOpenFailed: this.snapshot.storeOpenFailed,
    });
  }

  private async readActiveWorkoutId(): Promise<string | undefined> {
    const result = await this.plugin.getActiveSession();
    const payload = result.aggregate?.payload;
    if (payload === undefined) return undefined;
    const session = payload.session;
    if (!isRecord(session)) return undefined;
    const workout = session.workout;
    if (!isRecord(workout) || typeof workout.id !== 'string') return undefined;
    return workout.id;
  }

  private publish(snapshot: NativeAppCompatibilitySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
