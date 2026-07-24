import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const credentialPath = process.argv
  .slice(2)
  .find((argument) => argument !== '--');

if (credentialPath === undefined) {
  throw new Error(
    'Usage: pnpm -C api configure:google-oauth -- ../client_secret_....json',
  );
}

const absoluteCredentialPath = resolve(process.cwd(), credentialPath);
const environmentPath = resolve(process.cwd(), '.env');
const exampleEnvironmentPath = resolve(process.cwd(), '.env.example');
const credentialJson = await readFile(absoluteCredentialPath, 'utf8');
const credentialDocument = JSON.parse(credentialJson);

if (
  typeof credentialDocument?.web?.client_id !== 'string' ||
  typeof credentialDocument?.web?.client_secret !== 'string' ||
  !Array.isArray(credentialDocument?.web?.redirect_uris) ||
  typeof credentialDocument.web.redirect_uris[0] !== 'string'
) {
  throw new Error('The credential must be a Google OAuth Web client JSON.');
}

let environment;

try {
  environment = await readFile(environmentPath, 'utf8');
} catch {
  environment = await readFile(exampleEnvironmentPath, 'utf8');
}

const encodedCredential = Buffer.from(
  JSON.stringify(credentialDocument),
).toString('base64');
environment = upsertEnvironmentValue(
  environment,
  'GOOGLE_OAUTH_CREDENTIALS_BASE64',
  encodedCredential,
);
environment = upsertEnvironmentValue(
  environment,
  'AUTH_TEST_BYPASS_ENABLED',
  'true',
);
environment = upsertEnvironmentValue(
  environment,
  'AUTH_TEST_BYPASS_KEY',
  'local-auth-test-key',
);
environment = upsertEnvironmentValue(
  environment,
  'UI_URL',
  'http://localhost:3000',
);

const configuredSessionSecret = getEnvironmentValue(
  environment,
  'AUTH_SESSION_SECRET',
);
if (
  configuredSessionSecret === undefined ||
  configuredSessionSecret.startsWith('replace-with-')
) {
  environment = upsertEnvironmentValue(
    environment,
    'AUTH_SESSION_SECRET',
    randomBytes(48).toString('base64url'),
  );
}

await writeFile(environmentPath, environment, { mode: 0o600 });
await chmod(environmentPath, 0o600);
process.stdout.write(
  'Google OAuth credential encoded and local api/.env updated without printing secrets.\n',
);

function getEnvironmentValue(source, key) {
  const expression = new RegExp(`^${key}=(.*)$`, 'm');
  const result = expression.exec(source)?.[1];

  return result;
}

function upsertEnvironmentValue(source, key, value) {
  const line = `${key}=${value}`;
  const expression = new RegExp(`^${key}=.*$`, 'm');

  if (expression.test(source)) {
    const result = source.replace(expression, line);

    return result;
  }

  const separator = source.endsWith('\n') ? '' : '\n';
  const result = `${source}${separator}${line}\n`;

  return result;
}
