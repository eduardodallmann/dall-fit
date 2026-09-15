import type { PluginListenerHandle } from '@capacitor/core';

import type { NativeSessionCoordinator } from '~/auth/native-session';
import {
  offlineStoragePlugin,
  type OfflineStoragePlugin,
  type OfflineSyncState,
} from '~/core/platform/native/offline-storage-plugin';

type SyncPlugin = Pick<
  OfflineStoragePlugin,
  'addListener' | 'clearSyncCredentials' | 'getSyncState' | 'triggerSync'
>;

export class OfflineSyncCoordinator {
  private readonly apiBaseUrl: string;
  private credentialCleanup: (() => void) | undefined;
  private initialized = false;
  private readonly plugin: SyncPlugin;
  private readonly session: NativeSessionCoordinator;
  private stateListener: PluginListenerHandle | undefined;

  constructor(
    session: NativeSessionCoordinator,
    plugin: SyncPlugin = offlineStoragePlugin,
    apiBaseUrl: string = import.meta.env.VITE_API_URL,
  ) {
    this.session = session;
    this.plugin = plugin;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.stateListener = await this.plugin.addListener(
      'syncStateChanged',
      (state) => void this.handleState(state).catch(() => undefined),
    );
    this.credentialCleanup = this.session.addCredentialListener(
      (accessToken) => {
        void this.applyCredential(accessToken, true).catch(() => undefined);
      },
    );
    document.addEventListener('visibilitychange', this.handleVisibility);
    await this.reconcile();
  }

  async syncNow(): Promise<void> {
    await this.trigger(true);
  }

  async destroy(): Promise<void> {
    if (!this.initialized) return;
    this.initialized = false;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.credentialCleanup?.();
    this.credentialCleanup = undefined;
    await this.stateListener?.remove();
    this.stateListener = undefined;
    await this.plugin.clearSyncCredentials();
  }

  private readonly handleVisibility = () => {
    if (document.visibilityState === 'visible')
      void this.trigger(true).catch(() => undefined);
  };

  private async applyCredential(
    accessToken: string | undefined,
    rearmTemporary: boolean,
  ): Promise<void> {
    if (!this.initialized) return;
    if (accessToken === undefined) {
      await this.plugin.clearSyncCredentials();
      return;
    }
    await this.plugin.triggerSync({
      accessToken,
      apiBaseUrl: this.apiBaseUrl,
      rearmTemporary,
    });
  }

  private async handleState(state: OfflineSyncState): Promise<void> {
    if (state.state !== 'authentication-required') return;
    await this.session.expireSession();
  }

  private async reconcile(): Promise<void> {
    const state = await this.plugin.getSyncState();
    await this.handleState(state);
    await this.trigger(false);
  }

  private async trigger(rearmTemporary: boolean): Promise<void> {
    const accessToken = await this.session.getAccessToken();
    await this.applyCredential(accessToken, rearmTemporary);
  }
}
