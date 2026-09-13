import type { NativeLocalDataPort } from '~/auth/native-session';
import {
  offlineStoragePlugin,
  type OfflineStoragePlugin,
} from '~/core/platform/native/offline-storage-plugin';
import { removeStoredTheme } from '~/core/theme/theme-storage';

export class NativeLocalDataAdapter implements NativeLocalDataPort {
  private readonly plugin: Pick<
    OfflineStoragePlugin,
    'bindAccount' | 'clearAccountData' | 'hasPendingChanges'
  >;

  constructor(
    plugin: Pick<
      OfflineStoragePlugin,
      'bindAccount' | 'clearAccountData' | 'hasPendingChanges'
    > = offlineStoragePlugin,
  ) {
    this.plugin = plugin;
  }

  async bindAccount(personId: string): Promise<void> {
    await this.plugin.bindAccount({ personId });
  }

  async clearAccountDataAtomically(): Promise<void> {
    await this.plugin.clearAccountData();
    removeStoredTheme();
  }

  async hasPendingChanges(): Promise<boolean> {
    const result = await this.plugin.hasPendingChanges();

    return result.value;
  }
}
