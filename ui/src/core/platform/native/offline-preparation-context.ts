import { createContext, use } from 'react';

import type { OfflinePreparationCoordinator } from './offline-preparation';

export const OfflinePreparationContext =
  createContext<OfflinePreparationCoordinator | null>(null);

export function useOfflinePreparation(): OfflinePreparationCoordinator | null {
  return use(OfflinePreparationContext);
}
