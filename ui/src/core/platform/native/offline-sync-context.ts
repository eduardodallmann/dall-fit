import { createContext, use } from 'react';

import type { OfflineSyncCoordinator } from './offline-sync';

export const OfflineSyncContext = createContext<OfflineSyncCoordinator | null>(
  null,
);

export function useOfflineSync(): OfflineSyncCoordinator | null {
  return use(OfflineSyncContext);
}
