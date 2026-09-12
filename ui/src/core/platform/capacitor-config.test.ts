import { describe, expect, it } from 'vitest';

import capacitorConfig from '../../../capacitor.config';

describe('Capacitor production configuration', () => {
  it('uses the Vite bundle and the stable Android application identity', () => {
    expect(capacitorConfig).toMatchObject({
      appId: 'com.dallfit.app',
      appName: 'Dall Fit',
      webDir: 'dist',
    });
  });

  it('does not enable a remote or cleartext production server', () => {
    expect(capacitorConfig.server?.url).toBeUndefined();
    expect(capacitorConfig.server?.allowNavigation).toBeUndefined();
    expect(capacitorConfig.server?.cleartext).not.toBe(true);
  });
});
