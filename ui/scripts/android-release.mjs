import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const uiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDirectory = resolve(uiDirectory, 'android');
const androidBuildFile = resolve(androidDirectory, 'app/build.gradle');
const outputDirectory = resolve(
  androidDirectory,
  'app/build/outputs/bundle/release',
);
const bundlePath = resolve(outputDirectory, 'app-release.aab');
const checksumPath = `${bundlePath}.sha256`;
const metadataPath = `${bundlePath}.metadata.json`;

export const releaseSigningVariables = Object.freeze([
  'DALL_FIT_UPLOAD_KEYSTORE_PATH',
  'DALL_FIT_UPLOAD_STORE_PASSWORD',
  'DALL_FIT_UPLOAD_KEY_ALIAS',
  'DALL_FIT_UPLOAD_KEY_PASSWORD',
]);

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some(Number.isNaN)) return false;

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function validateProductionApiUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('VITE_API_URL must be a valid HTTPS URL.');
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLocalHostname =
    hostname === 'localhost' || hostname.endsWith('.localhost');
  const isPrivateAddress =
    (isIP(hostname) === 4 && isPrivateIpv4(hostname)) ||
    (isIP(hostname) === 6 &&
      (hostname === '::1' ||
        hostname.startsWith('fc') ||
        hostname.startsWith('fd') ||
        hostname.startsWith('fe80:')));

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    isLocalHostname ||
    isPrivateAddress
  ) {
    throw new Error(
      'VITE_API_URL must use HTTPS and a public host without embedded credentials.',
    );
  }

  return url.toString().replace(/\/$/, '');
}

export function validateReleaseEnvironment(
  environment,
  fileExists = existsSync,
) {
  const apiUrl = validateProductionApiUrl(environment.VITE_API_URL ?? '');
  const googleClientId = environment.VITE_GOOGLE_SERVER_CLIENT_ID?.trim() ?? '';
  if (
    googleClientId === '' ||
    !googleClientId.endsWith('.apps.googleusercontent.com')
  ) {
    throw new Error(
      'VITE_GOOGLE_SERVER_CLIENT_ID must be a Google OAuth Web client ID.',
    );
  }
  if (
    environment.VITE_ENABLE_API_MOCKS !== undefined &&
    environment.VITE_ENABLE_API_MOCKS !== 'false'
  ) {
    throw new Error(
      'VITE_ENABLE_API_MOCKS must be absent or false for release.',
    );
  }

  const missingSigningVariables = releaseSigningVariables.filter(
    (name) => !environment[name]?.trim(),
  );
  if (missingSigningVariables.length > 0) {
    throw new Error(
      `Release signing configuration is incomplete: ${missingSigningVariables.join(', ')}.`,
    );
  }
  if (!fileExists(environment.DALL_FIT_UPLOAD_KEYSTORE_PATH)) {
    throw new Error('DALL_FIT_UPLOAD_KEYSTORE_PATH does not reference a file.');
  }

  return Object.freeze({ apiUrl, googleClientId });
}

export function readAndroidVersion(buildFileSource) {
  const applicationId = buildFileSource.match(
    /applicationId\s+["']([^"']+)["']/,
  )?.[1];
  const versionCode = Number(buildFileSource.match(/versionCode\s+(\d+)/)?.[1]);
  const versionName = buildFileSource.match(
    /versionName\s+["']([^"']+)["']/,
  )?.[1];

  if (
    applicationId !== 'com.dallfit.app' ||
    !Number.isSafeInteger(versionCode) ||
    versionCode <= 0 ||
    versionName === undefined ||
    versionName.trim() === ''
  ) {
    throw new Error('Android release identity is invalid in app/build.gradle.');
  }

  return Object.freeze({ applicationId, versionCode, versionName });
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: uiDirectory,
    env: process.env,
    stdio: 'inherit',
  });
}

function readCertificateSha256() {
  const output = execFileSync(
    'keytool',
    ['-printcert', '-jarfile', bundlePath],
    { cwd: uiDirectory, encoding: 'utf8', env: process.env },
  );
  const fingerprint = output.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1];
  if (fingerprint === undefined) {
    throw new Error('Unable to read the upload certificate from the AAB.');
  }
  return fingerprint.toUpperCase();
}

export function buildRelease() {
  validateReleaseEnvironment(process.env);
  process.env.VITE_ENABLE_API_MOCKS = 'false';
  const version = readAndroidVersion(readFileSync(androidBuildFile, 'utf8'));

  rmSync(resolve(uiDirectory, 'dist'), { force: true, recursive: true });
  run('pnpm', ['build']);
  run('pnpm', ['exec', 'cap', 'sync', 'android']);
  run(resolve(androidDirectory, 'gradlew'), [
    '-p',
    androidDirectory,
    '--no-daemon',
    'bundleRelease',
  ]);

  if (!existsSync(bundlePath)) {
    throw new Error(`Gradle did not produce the expected AAB: ${bundlePath}`);
  }

  const signatureVerification = execFileSync(
    'jarsigner',
    ['-verify', bundlePath],
    {
      cwd: uiDirectory,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (!signatureVerification.includes('jar verified.')) {
    throw new Error('The generated AAB does not have a verifiable signature.');
  }

  const checksum = createHash('sha256')
    .update(readFileSync(bundlePath))
    .digest('hex');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: uiDirectory,
    encoding: 'utf8',
  }).trim();
  const metadata = {
    ...version,
    artifact: 'app-release.aab',
    commit,
    sha256: checksum,
    uploadCertificateSha256: readCertificateSha256(),
  };

  writeFileSync(checksumPath, `${checksum}  app-release.aab\n`, {
    mode: 0o644,
  });
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o644,
  });

  process.stdout.write(
    `Android release ready: ${version.applicationId} ${version.versionName} (${version.versionCode})\n` +
      `AAB: ${bundlePath}\nSHA-256: ${checksum}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    buildRelease();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Android release failed: ${message}\n`);
    process.exitCode = 1;
  }
}
