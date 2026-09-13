import type { NativeLocalDataPort } from '~/auth/native-session';
import { removeStoredTheme } from '~/core/theme/theme-storage';

export class NativeLocalDataAdapter implements NativeLocalDataPort {
  clearAccountDataAtomically(): Promise<void> {
    removeStoredTheme();
    return Promise.resolve();
  }

  hasPendingChanges(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
