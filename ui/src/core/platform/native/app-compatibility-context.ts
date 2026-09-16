import { createContext, use } from 'react';

import type { NativeAppCompatibilityCoordinator } from './app-compatibility';

export const NativeAppCompatibilityContext =
  createContext<NativeAppCompatibilityCoordinator | null>(null);

export function useNativeAppCompatibility(): NativeAppCompatibilityCoordinator | null {
  return use(NativeAppCompatibilityContext);
}
