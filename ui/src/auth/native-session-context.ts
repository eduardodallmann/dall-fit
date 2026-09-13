import { createContext, use } from 'react';

import type { NativeSessionCoordinator } from '~/auth/native-session';

export const NativeSessionContext =
  createContext<NativeSessionCoordinator | null>(null);

export function useNativeSession(): NativeSessionCoordinator | null {
  const result = use(NativeSessionContext);

  return result;
}
