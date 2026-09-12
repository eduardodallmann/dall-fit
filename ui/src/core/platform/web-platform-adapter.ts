import {
  createPlatformSnapshot,
  type PlatformAdapter,
  type PlatformSnapshot,
} from '~/core/platform/platform';

const webSnapshot = createPlatformSnapshot('web', false);

export class WebPlatformAdapter implements PlatformAdapter {
  getSnapshot(): PlatformSnapshot {
    return webSnapshot;
  }
}
