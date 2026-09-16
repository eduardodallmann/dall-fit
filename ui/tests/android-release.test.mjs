import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import {
  readAndroidVersion,
  releaseSigningVariables,
  validateProductionApiUrl,
  validateReleaseEnvironment,
} from '../scripts/android-release.mjs';

const validEnvironment = {
  DALL_FIT_UPLOAD_KEYSTORE_PATH: '/private/upload.jks',
  DALL_FIT_UPLOAD_STORE_PASSWORD: 'store-password',
  DALL_FIT_UPLOAD_KEY_ALIAS: 'upload',
  DALL_FIT_UPLOAD_KEY_PASSWORD: 'key-password',
  VITE_API_URL: 'https://api.dallfit.example',
  VITE_ENABLE_API_MOCKS: 'false',
  VITE_GOOGLE_SERVER_CLIENT_ID: '123456789-example.apps.googleusercontent.com',
};

test('accepts an explicit production release environment', () => {
  const result = validateReleaseEnvironment(validEnvironment, () => true);

  assert.equal(result.apiUrl, 'https://api.dallfit.example');
  assert.equal(
    result.googleClientId,
    validEnvironment.VITE_GOOGLE_SERVER_CLIENT_ID,
  );
});

for (const invalidUrl of [
  'http://api.dallfit.example',
  'https://localhost:4000',
  'https://127.0.0.1',
  'https://10.0.0.1',
  'https://172.16.0.1',
  'https://192.168.0.1',
  'https://[::1]',
  'https://[fd00::1]',
  'https://user:password@api.dallfit.example',
]) {
  test(`rejects unsafe API URL ${invalidUrl}`, () => {
    assert.throws(
      () => validateProductionApiUrl(invalidUrl),
      /HTTPS and a public host/,
    );
  });
}

test('rejects mocks and an invalid OAuth audience', () => {
  assert.throws(
    () =>
      validateReleaseEnvironment(
        { ...validEnvironment, VITE_ENABLE_API_MOCKS: 'true' },
        () => true,
      ),
    /must be absent or false/,
  );
  assert.throws(
    () =>
      validateReleaseEnvironment(
        { ...validEnvironment, VITE_GOOGLE_SERVER_CLIENT_ID: 'not-google' },
        () => true,
      ),
    /Google OAuth Web client ID/,
  );
});

for (const variable of releaseSigningVariables) {
  test(`rejects missing signing variable ${variable}`, () => {
    const environment = { ...validEnvironment };
    delete environment[variable];

    assert.throws(
      () => validateReleaseEnvironment(environment, () => true),
      new RegExp(variable),
    );
  });
}

test('rejects a missing upload keystore file', () => {
  assert.throws(
    () => validateReleaseEnvironment(validEnvironment, () => false),
    /does not reference a file/,
  );
});

test('reads the committed Android application identity', () => {
  const source = readFileSync(
    new URL('../android/app/build.gradle', import.meta.url),
    'utf8',
  );

  assert.deepEqual(readAndroidVersion(source), {
    applicationId: 'com.dallfit.app',
    versionCode: 2,
    versionName: '1.0',
  });
});
