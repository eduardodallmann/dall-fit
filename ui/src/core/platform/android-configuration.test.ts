import { describe, expect, it } from 'vitest';

import rootPackageSource from '../../../../package.json?raw';
import androidManifest from '../../../android/app/src/main/AndroidManifest.xml?raw';
import mainActivity from '../../../android/app/src/main/java/com/dallfit/app/MainActivity.java?raw';
import offlineStoragePlugin from '../../../android/app/src/main/java/com/dallfit/app/OfflineStoragePlugin.java?raw';
import backupRules from '../../../android/app/src/main/res/xml/backup_rules.xml?raw';
import dataExtractionRules from '../../../android/app/src/main/res/xml/data_extraction_rules.xml?raw';
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
    expect(
      uiPackage.dependencies?.['@capawesome/capacitor-google-sign-in'],
    ).toBe('0.1.4');
    expect(
      uiPackage.dependencies?.['@aparajita/capacitor-secure-storage'],
    ).toBe('8.0.0');
    expect(uiPackage.devDependencies?.['@capacitor/cli']).toBe('8.5.2');
    expect(androidVariables).toMatch(/minSdkVersion\s*=\s*29/);
    expect(androidVariables).toMatch(/compileSdkVersion\s*=\s*36/);
    expect(androidVariables).toMatch(/targetSdkVersion\s*=\s*36/);
  });

  it('excludes every private Android data domain from backup and transfer', () => {
    expect(androidManifest).toContain(
      'android:dataExtractionRules="@xml/data_extraction_rules"',
    );
    expect(androidManifest).toContain(
      'android:fullBackupContent="@xml/backup_rules"',
    );
    for (const domain of [
      'root',
      'file',
      'database',
      'sharedpref',
      'external',
      'device_root',
      'device_file',
      'device_database',
      'device_sharedpref',
    ]) {
      const exclusion = `<exclude domain="${domain}" path="." />`;
      expect(backupRules).toContain(exclusion);
      expect(
        dataExtractionRules.match(new RegExp(exclusion, 'g')),
      ).toHaveLength(2);
    }
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
    expect(uiPackage.scripts['android:test']).toBe(
      'pnpm android:sync && ./android/gradlew -p android connectedDebugAndroidTest',
    );
    expect(rootPackage.scripts).toMatchObject({
      'android:build:debug': 'pnpm -C ui android:build:debug',
      'android:open': 'pnpm -C ui android:open',
      'android:run': 'pnpm -C ui android:run',
      'android:sync': 'pnpm -C ui android:sync',
      'android:test': 'pnpm -C ui android:test',
    });
  });

  it('registers the local offline plugin before the Capacitor bridge is created', () => {
    const registration = mainActivity.indexOf(
      'registerPlugin(OfflineStoragePlugin.class)',
    );
    const bridgeCreation = mainActivity.indexOf(
      'super.onCreate(savedInstanceState)',
    );

    expect(registration).toBeGreaterThan(-1);
    expect(registration).toBeLessThan(bridgeCreation);
    expect(offlineStoragePlugin).toContain(
      '@CapacitorPlugin(name = "OfflineStorage")',
    );
    expect(androidManifest).not.toContain('READ_EXTERNAL_STORAGE');
    expect(androidManifest).not.toContain('WRITE_EXTERNAL_STORAGE');
    expect(androidManifest).not.toContain('MANAGE_EXTERNAL_STORAGE');
    expect(androidManifest).toContain(
      'android.permission.ACCESS_NETWORK_STATE',
    );
    expect(androidManifest).not.toContain(
      'android.permission.FOREGROUND_SERVICE',
    );
  });
});
