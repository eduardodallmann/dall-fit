import { createContext, useContext } from 'react';

export type PwaInstallationMode = 'installed' | 'manual' | 'prompt';

export interface PwaContextValue {
  dismissUpdate: () => void;
  install: () => Promise<void>;
  installationMode: PwaInstallationMode;
  isInstalling: boolean;
  isUpdating: boolean;
  needRefresh: boolean;
  updateFailed?: boolean;
  update: () => Promise<void>;
}

export const PwaContext = createContext<PwaContextValue | undefined>(undefined);

export function usePwa(): PwaContextValue {
  const context = useContext(PwaContext);

  if (context === undefined) {
    throw new Error('usePwa must be used inside PwaProvider');
  }

  return context;
}
