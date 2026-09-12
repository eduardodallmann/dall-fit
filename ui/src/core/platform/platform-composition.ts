import { CapacitorPlatformAdapter } from '~/core/platform/native/capacitor-platform-adapter';
import type {
  OptionalPlatformAdapter,
  PlatformAdapter,
  PlatformSnapshot,
} from '~/core/platform/platform';
import { WebPlatformAdapter } from '~/core/platform/web-platform-adapter';

export function resolveApplicationPlatform(
  nativeAdapter: OptionalPlatformAdapter = new CapacitorPlatformAdapter(),
  webAdapter: PlatformAdapter = new WebPlatformAdapter(),
): PlatformSnapshot {
  return nativeAdapter.getSnapshot() ?? webAdapter.getSnapshot();
}
