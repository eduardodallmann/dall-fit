import { createContext, use } from 'react';

export type ApplicationPlatform = 'android' | 'web';

export interface PlatformCapabilities {
  readonly nativeAuthentication: boolean;
  readonly nativeBridge: boolean;
}

export interface PlatformSnapshot {
  readonly capabilities: Readonly<PlatformCapabilities>;
  readonly platform: ApplicationPlatform;
}

export interface PlatformAdapter {
  getSnapshot(): PlatformSnapshot;
}

export interface OptionalPlatformAdapter {
  getSnapshot(): PlatformSnapshot | null;
}

export const PlatformContext = createContext<PlatformSnapshot | null>(null);

export function usePlatform(): PlatformSnapshot {
  const platform = use(PlatformContext);
  if (platform === null)
    throw new Error('PlatformContext must be provided by AppProviders.');

  return platform;
}

export function createPlatformSnapshot(
  platform: ApplicationPlatform,
  nativeBridge: boolean,
): PlatformSnapshot {
  const capabilities = Object.freeze({
    nativeAuthentication: platform === 'android' && nativeBridge,
    nativeBridge,
  });
  return Object.freeze({ capabilities, platform });
}
