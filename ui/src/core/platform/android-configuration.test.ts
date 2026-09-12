import { describe, expect, it } from 'vitest';

import rootPackageSource from '../../../../package.json?raw';
import androidVariables from '../../../android/variables.gradle?raw';
import uiPackageSource from '../../../package.json?raw';

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts: Record<string, string>;
}

function parsePackage(source: string): PackageManifest {
  return JSON.parse(source) as PackageManifest;
}

describe('Android workspace configuration', () => {
  it('keeps Capacitor packages aligned and Android at API 29', () => {
    const uiPackage = parsePackage(uiPackageSource);

    expect(uiPackage.dependencies?.['@capacitor/android']).toBe('8.5.2');
    expect(uiPackage.dependencies?.['@capacitor/core']).toBe('8.5.2');
    expect(uiPackage.devDependencies?.['@capacitor/cli']).toBe('8.5.2');
    expect(androidVariables).toMatch(/minSdkVersion\s*=\s*29/);
    expect(androidVariables).toMatch(/compileSdkVersion\s*=\s*36/);
    expect(androidVariables).toMatch(/targetSdkVersion\s*=\s*36/);
  });

  it('builds the Web bundle before every Android sync-dependent command', () => {
    const uiPackage = parsePackage(uiPackageSource);
    const rootPackage = parsePackage(rootPackageSource);

    expect(uiPackage.scripts['android:sync']).toBe(
      'pnpm build && cap sync android',
    );
    expect(uiPackage.scripts['android:run']).toMatch(/^pnpm android:sync &&/);
    expect(uiPackage.scripts['android:build:debug']).toMatch(
      /^pnpm android:sync &&/,
    );
    expect(rootPackage.scripts).toMatchObject({
      'android:build:debug': 'pnpm -C ui android:build:debug',
      'android:open': 'pnpm -C ui android:open',
      'android:run': 'pnpm -C ui android:run',
      'android:sync': 'pnpm -C ui android:sync',
    });
  });
});
