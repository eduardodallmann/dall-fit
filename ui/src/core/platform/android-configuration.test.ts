import { describe, expect, it } from 'vitest';

import androidReleaseWorkflow from '../../../../.github/workflows/android-release.yml?raw';
import rootPackageSource from '../../../../package.json?raw';
import androidGitignore from '../../../android/.gitignore?raw';
import androidAppBuild from '../../../android/app/build.gradle?raw';
import androidManifest from '../../../android/app/src/main/AndroidManifest.xml?raw';
import androidApplication from '../../../android/app/src/main/java/com/dallfit/app/DallFitApplication.java?raw';
import mainActivity from '../../../android/app/src/main/java/com/dallfit/app/MainActivity.java?raw';
import nativeSyncSessionStore from '../../../android/app/src/main/java/com/dallfit/app/offline/NativeSyncSessionStore.java?raw';
import offlineActionNotifier from '../../../android/app/src/main/java/com/dallfit/app/offline/OfflineActionNotifier.java?raw';
import offlineSyncWorker from '../../../android/app/src/main/java/com/dallfit/app/offline/OfflineSyncWorker.java?raw';
import offlineSyncScheduler from '../../../android/app/src/main/java/com/dallfit/app/offline/OfflineSyncWorkScheduler.java?raw';
import offlineStoragePlugin from '../../../android/app/src/main/java/com/dallfit/app/OfflineStoragePlugin.java?raw';
import launcherMark from '../../../android/app/src/main/res/drawable/ic_dall_fit_mark.xml?raw';
import monochromeLauncherMark from '../../../android/app/src/main/res/drawable/ic_dall_fit_monochrome.xml?raw';
import notificationIcon from '../../../android/app/src/main/res/drawable/ic_notification.xml?raw';
import launcherIcon from '../../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml?raw';
import themedLauncherIcon from '../../../android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml?raw';
import legacyLauncherIcon from '../../../android/app/src/main/res/mipmap-anydpi/ic_launcher.xml?raw';
import launchStyles from '../../../android/app/src/main/res/values/styles.xml?raw';
import backupRules from '../../../android/app/src/main/res/xml/backup_rules.xml?raw';
import dataExtractionRules from '../../../android/app/src/main/res/xml/data_extraction_rules.xml?raw';
import fileProviderPaths from '../../../android/app/src/main/res/xml/file_paths.xml?raw';
import androidVariables from '../../../android/variables.gradle?raw';
import uiPackageSource from '../../../package.json?raw';
import releaseScript from '../../../scripts/android-release.mjs?raw';

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
    expect(uiPackage.scripts['android:build:debug']).toBe(
      'pnpm android:sync && ./android/gradlew -p android assembleDebug && mv ./android/app/build/outputs/apk/debug/app-debug.apk ./android/app-debug.apk',
    );
    expect(uiPackage.scripts['android:build:release']).toBe(
      'node scripts/android-release.mjs',
    );
    expect(uiPackage.scripts['android:test']).toBe(
      'pnpm android:sync && ./android/gradlew -p android connectedDebugAndroidTest',
    );
    expect(rootPackage.scripts).toMatchObject({
      'android:build:debug': 'pnpm -C ui android:build:debug',
      'android:build:release': 'pnpm -C ui android:build:release',
      'android:open': 'pnpm -C ui android:open',
      'android:run': 'pnpm -C ui android:run',
      'android:sync': 'pnpm -C ui android:sync',
      'android:test': 'pnpm -C ui android:test',
    });
  });

  it('fails closed for release signing and keeps keystores ignored', () => {
    for (const variable of [
      'DALL_FIT_UPLOAD_KEYSTORE_PATH',
      'DALL_FIT_UPLOAD_STORE_PASSWORD',
      'DALL_FIT_UPLOAD_KEY_ALIAS',
      'DALL_FIT_UPLOAD_KEY_PASSWORD',
    ]) {
      expect(androidAppBuild).toContain(variable);
      expect(releaseScript).toContain(variable);
    }
    expect(androidAppBuild).toContain('signingConfig signingConfigs.release');
    expect(androidAppBuild).toContain(
      'Release signing configuration is incomplete',
    );
    expect(androidGitignore).toContain('*.jks');
    expect(androidGitignore).toContain('*.keystore');
    expect(androidGitignore).toContain('/app-debug.apk');
    expect(releaseScript).toContain("['-verify', bundlePath]");
    expect(releaseScript).toContain("createHash('sha256')");
  });

  it('keeps the release workflow manual, protected and unable to publish', () => {
    expect(androidReleaseWorkflow).toContain('workflow_dispatch: {}');
    expect(androidReleaseWorkflow).toContain('contents: read');
    expect(androidReleaseWorkflow).toContain('environment: android-production');
    expect(androidReleaseWorkflow).toContain('pnpm android:build:release');
    expect(androidReleaseWorkflow).toContain('DALL_FIT_UPLOAD_KEYSTORE_BASE64');
    expect(androidReleaseWorkflow).toContain('if: always()');
    expect(androidReleaseWorkflow).not.toContain('pull_request:');
    expect(androidReleaseWorkflow).not.toContain('service_account');
    expect(androidReleaseWorkflow).not.toContain('google-play');
  });

  it('uses Dall Fit launcher, splash and notification resources', () => {
    expect(mainActivity).toContain('SplashScreen.installSplashScreen(this)');
    expect(launchStyles).toContain(
      '<item name="windowSplashScreenAnimatedIcon">@drawable/ic_dall_fit_mark</item>',
    );
    expect(launchStyles).toContain(
      '<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
    );
    expect(launcherIcon).toContain('@drawable/ic_dall_fit_mark');
    expect(themedLauncherIcon).toContain('@drawable/ic_dall_fit_mark');
    expect(themedLauncherIcon).toContain('@drawable/ic_dall_fit_monochrome');
    expect(launcherMark).toContain('#21B9E5');
    expect(monochromeLauncherMark).toContain('#000000');
    expect(notificationIcon).toContain('#FFFFFFFF');
    expect(legacyLauncherIcon).toContain('#21B9E5');
    expect(legacyLauncherIcon).not.toContain('Android');
    expect(offlineActionNotifier).toContain(
      '.setSmallIcon(R.drawable.ic_notification)',
    );
  });

  it('limits FileProvider to the private offline media directory', () => {
    expect(fileProviderPaths).toContain(
      '<files-path name="offline_media" path="offline/account/files/" />',
    );
    expect(fileProviderPaths).not.toContain('external-path');
    expect(fileProviderPaths).not.toContain('cache-path');
    expect(androidManifest).toContain('android:exported="false"');
    expect(androidManifest).toContain('android:grantUriPermissions="true"');
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

  it('configures persistent best-effort sync without a foreground service', () => {
    expect(androidVariables).toMatch(/androidxWorkVersion\s*=\s*'2\.11\.2'/);
    expect(androidAppBuild).toContain(
      'implementation "androidx.work:work-runtime:$androidxWorkVersion"',
    );
    expect(androidAppBuild).toContain(
      'androidTestImplementation "androidx.work:work-testing:$androidxWorkVersion"',
    );
    expect(androidManifest).toContain('android:name=".DallFitApplication"');
    expect(androidApplication).toContain(
      'OfflineStorageProvider.initializeBackground(this)',
    );
    expect(offlineSyncScheduler).toContain('ExistingWorkPolicy.KEEP');
    expect(offlineSyncScheduler).toContain('ExistingPeriodicWorkPolicy.KEEP');
    expect(offlineSyncScheduler).toContain(
      'setRequiredNetworkType(NetworkType.CONNECTED)',
    );
    expect(offlineSyncScheduler).toContain(
      'PERIODIC_HOURS,\n            TimeUnit.HOURS',
    );
    expect(offlineSyncScheduler).toContain(
      'BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS',
    );
    expect(offlineSyncWorker).toContain('extends Worker');
    expect(offlineSyncWorker).not.toContain('setForeground');
    expect(offlineSyncScheduler).not.toContain('setExpedited');
    expect(androidManifest).not.toContain(
      'android.permission.FOREGROUND_SERVICE',
    );
  });

  it('keeps the Bearer in the existing encrypted native envelope', () => {
    expect(nativeSyncSessionStore).toContain(
      'WSSecureStorageSharedPreferences',
    );
    expect(nativeSyncSessionStore).toContain(
      'dall-fit-native_session-envelope',
    );
    expect(nativeSyncSessionStore).toContain('AndroidKeyStore');
    expect(nativeSyncSessionStore).toContain('AES/GCM/NoPadding');
    expect(nativeSyncSessionStore).not.toContain('putString(ENVELOPE_KEY');
    expect(offlineSyncWorker).not.toContain('Authorization');
  });
});
