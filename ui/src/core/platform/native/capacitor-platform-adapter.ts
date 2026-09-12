import { Capacitor } from '@capacitor/core';

import {
  createPlatformSnapshot,
  type OptionalPlatformAdapter,
  type PlatformSnapshot,
} from '~/core/platform/platform';

export interface CapacitorRuntimeProbe {
  getPlatform(): string;
  isNativePlatform(): boolean;
}

const androidSnapshot = createPlatformSnapshot('android', true);

export class CapacitorPlatformAdapter implements OptionalPlatformAdapter {
  private readonly runtime: CapacitorRuntimeProbe;

  constructor(runtime: CapacitorRuntimeProbe = Capacitor) {
    this.runtime = runtime;
  }

  getSnapshot(): PlatformSnapshot | null {
    if (
      !this.runtime.isNativePlatform() ||
      this.runtime.getPlatform() !== 'android'
    )
      return null;

    return androidSnapshot;
  }
}
