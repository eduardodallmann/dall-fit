import type { PluginListenerHandle } from '@capacitor/core';

import type { NativeSessionCoordinator } from '~/auth/native-session';
import {
  offlineStoragePlugin,
  type OfflineCompletionPresentation,
  type OfflineStoragePlugin,
  type OfflineSyncAction,
  type OfflineSyncState,
} from '~/core/platform/native/offline-storage-plugin';

type SyncPlugin = Pick<
  OfflineStoragePlugin,
  | 'addListener'
  | 'clearInvalidLeaseData'
  | 'clearSyncCredentials'
  | 'discardSyncAction'
  | 'dismissActionNotificationPrompt'
  | 'getActionNotificationPermission'
  | 'getLatestCompletion'
  | 'getNextSyncAction'
  | 'getSyncState'
  | 'resolveSyncConflict'
  | 'requestActionNotificationPermission'
  | 'triggerSync'
>;

export interface OfflineSyncSnapshot {
  action?: OfflineSyncAction;
  authenticationRequired?: boolean;
  completion?: OfflineCompletionPresentation;
  state?: OfflineSyncState;
  notificationPrompt?: boolean;
}

export class OfflineSyncCoordinator {
  private readonly apiBaseUrl: string;
  private authenticationRequired = false;
  private credentialCleanup: (() => void) | undefined;
  private initialized = false;
  private readonly listeners = new Set<() => void>();
  private readonly plugin: SyncPlugin;
  private readonly session: NativeSessionCoordinator;
  private stateListener: PluginListenerHandle | undefined;
  private snapshot: OfflineSyncSnapshot = {};

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

  getSnapshot = (): OfflineSyncSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async refresh(): Promise<void> {
    const [state, action, completion, notification] = await Promise.all([
      this.plugin.getSyncState(),
      this.plugin.getNextSyncAction?.() ?? Promise.resolve({}),
      this.plugin.getLatestCompletion?.() ?? Promise.resolve({}),
      this.plugin.getActionNotificationPermission?.() ??
        Promise.resolve({ granted: true, prompted: true }),
    ]);
    this.snapshot = {
      authenticationRequired: this.authenticationRequired,
      state,
      notificationPrompt: !notification.prompted && !notification.granted,
      ...(action.action === undefined ? {} : { action: action.action }),
      ...(completion.completion === undefined
        ? {}
        : { completion: completion.completion }),
    };
    for (const listener of this.listeners) listener();
  }

  async finishNotificationPrompt(requestPermission: boolean): Promise<void> {
    if (requestPermission)
      await this.plugin.requestActionNotificationPermission();
    else await this.plugin.dismissActionNotificationPrompt();
    await this.refresh();
  }

  async resolveConflict(
    action: OfflineSyncAction,
    choice: 'local' | 'server',
    conflictToken: string,
  ): Promise<boolean> {
    const result = await this.plugin.resolveSyncConflict({
      choice,
      conflictToken,
      executionId: action.executionId,
      expectedRevision: action.revision,
    });
    await this.refresh();
    return result.resolved;
  }

  async discard(action: OfflineSyncAction): Promise<boolean> {
    if (
      action.reason === 'lease-expired' ||
      action.reason === 'lease-revoked'
    ) {
      await this.plugin.clearInvalidLeaseData();
      await this.trigger(false);
      await this.refresh();
      return true;
    }
    const result = await this.plugin.discardSyncAction({
      executionId: action.executionId,
      expectedRevision: action.revision,
    });
    await this.refresh();
    return result.discarded;
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
    this.authenticationRequired = false;
    await this.plugin.triggerSync({
      accessToken,
      apiBaseUrl: this.apiBaseUrl,
      rearmTemporary,
    });
  }

  private async handleState(state: OfflineSyncState): Promise<void> {
    if (state.state === 'authentication-required')
      this.authenticationRequired = true;
    await this.refresh();
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
