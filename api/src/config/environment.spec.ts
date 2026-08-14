import { LOG_LEVELS } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { validateEnvironment } from '~/config/environment';

const credentialDocument = {
  web: {
    client_id: 'fake-client.apps.googleusercontent.com',
    client_secret: 'not-a-real-secret',
    redirect_uris: ['http://localhost:4000/callback'],
  },
};
const validEnvironment = {
  AUTH_SESSION_SECRET: 'a'.repeat(32),
  GOOGLE_OAUTH_CREDENTIALS_BASE64: Buffer.from(
    JSON.stringify(credentialDocument),
  ).toString('base64'),
};

describe('validateEnvironment', () => {
  it('applies safe local defaults and decodes Google credentials', () => {
    const result = validateEnvironment(validEnvironment);

    expect(result).toMatchObject({
      PORT: 4000,
      LOG_LEVEL: 'log',
      CORS_ORIGIN: 'http://localhost:3000',
      UI_URL: 'http://localhost:3000',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/dall-fit',
      REDIS_URL: 'redis://127.0.0.1:6379',
      REDIS_NAMESPACE: 'dall-fit:local',
      RUNTIME_ENVIRONMENT: 'local',
      RATE_LIMIT_GOOGLE_START_LIMIT: 10,
      RATE_LIMIT_GOOGLE_START_WINDOW_MS: 600_000,
      RATE_LIMIT_SESSION_LIMIT: 30,
      RATE_LIMIT_SESSION_WINDOW_MS: 60_000,
      AUTH_COOKIE_SECURE: false,
      AUTH_TEST_BYPASS_ENABLED: false,
      AUTH_TEST_BYPASS_E2E_ENABLED: false,
      GOOGLE_OAUTH_CREDENTIALS: {
        clientId: credentialDocument.web.client_id,
        clientSecret: credentialDocument.web.client_secret,
        redirectUri: credentialDocument.web.redirect_uris[0],
      },
    });
  });

  it('coerces values and preserves predefined environment variables', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      PORT: '4100',
      AUTH_COOKIE_SECURE: 'true',
      SYSTEM_VARIABLE: 'preserved',
    });

    expect(result.PORT).toBe(4100);
    expect(result.AUTH_COOKIE_SECURE).toBe(true);
    expect(result.SYSTEM_VARIABLE).toBe('preserved');
  });

  it.each(LOG_LEVELS)('accepts the native %s log level', (logLevel) => {
    const result = validateEnvironment({
      ...validEnvironment,
      LOG_LEVEL: logLevel,
    });

    expect(result.LOG_LEVEL).toBe(logLevel);
  });

  it.each(['', 'WARN', 'warn,error', 'silent'])(
    'rejects the invalid log level %j without exposing it',
    (logLevel) => {
      const execute = () =>
        validateEnvironment({
          ...validEnvironment,
          LOG_LEVEL: logLevel,
        });

      expect(execute).toThrow('LOG_LEVEL');

      if (logLevel !== '') {
        try {
          execute();
        } catch (error: unknown) {
          expect((error as Error).message).not.toContain(logLevel);
        }
      }
    },
  );

  it('reports invalid variables without exposing their values', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        PORT: 'invalid',
        CORS_ORIGIN: 'invalid',
        MONGODB_URI: 'postgresql://localhost/dall-fit',
        REDIS_URL: 'http://localhost:6379',
      }),
    ).toThrow(
      'Invalid environment variables: PORT: Invalid input: expected number, received NaN; CORS_ORIGIN: Invalid URL; MONGODB_URI: must use the mongodb:// or mongodb+srv:// protocol; REDIS_URL: must use the redis:// or rediss:// protocol',
    );
  });

  it('rejects a malformed encoded credential without exposing it', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        GOOGLE_OAUTH_CREDENTIALS_BASE64: 'sensitive-invalid-value',
      }),
    ).toThrow(
      'GOOGLE_OAUTH_CREDENTIALS_BASE64: must be a base64-encoded Google OAuth JSON document',
    );
  });

  it('requires the bypass key when the local bypass is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_TEST_BYPASS_ENABLED: 'true',
      }),
    ).toThrow('AUTH_TEST_BYPASS_KEY: required');
  });

  it('rejects insecure cookies and the bypass in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        TRUST_PROXY_HOPS: '1',
        AUTH_TEST_BYPASS_ENABLED: 'true',
        AUTH_TEST_BYPASS_KEY: 'a'.repeat(43),
      }),
    ).toThrow('AUTH_TEST_BYPASS_ENABLED: allowed only in local or test');

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        TRUST_PROXY_HOPS: '1',
      }),
    ).toThrow('AUTH_COOKIE_SECURE: must be true in production');
  });

  it('allows the bypass in CI only for an explicitly marked E2E runtime', () => {
    const ciTestEnvironment = {
      ...validEnvironment,
      AUTH_TEST_BYPASS_ENABLED: 'true',
      AUTH_TEST_BYPASS_KEY: 'a'.repeat(43),
      CI: 'true',
      NODE_ENV: 'test',
    };

    expect(() => validateEnvironment(ciTestEnvironment)).toThrow(
      'AUTH_TEST_BYPASS_ENABLED: allowed only in local or test runtimes outside Vercel and non-E2E CI',
    );

    expect(
      validateEnvironment({
        ...ciTestEnvironment,
        AUTH_TEST_BYPASS_E2E_ENABLED: 'true',
      }),
    ).toMatchObject({
      AUTH_TEST_BYPASS_E2E_ENABLED: true,
      AUTH_TEST_BYPASS_ENABLED: true,
      RUNTIME_ENVIRONMENT: 'test',
    });
  });

  it('rejects the E2E marker outside an enabled test bypass', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_TEST_BYPASS_E2E_ENABLED: 'true',
      }),
    ).toThrow(
      'AUTH_TEST_BYPASS_E2E_ENABLED: allowed only with the bypass enabled in the test runtime',
    );
  });

  it('requires TLS, namespace and explicit proxy trust in production', () => {
    const productionEnvironment = {
      ...validEnvironment,
      AUTH_COOKIE_SECURE: 'true',
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS: '1',
    };

    expect(() => validateEnvironment(productionEnvironment)).toThrow(
      'REDIS_URL: required in production',
    );
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        REDIS_NAMESPACE: 'dall-fit',
        REDIS_URL: 'redis://redis.example.test:6379',
      }),
    ).toThrow('REDIS_URL: must use TLS');
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        REDIS_URL: 'rediss://redis.example.test:6379',
      }),
    ).toThrow('REDIS_NAMESPACE: required in production');
  });

  it('requires only the opaque Blob store id for a published runtime', () => {
    const productionEnvironment = {
      ...validEnvironment,
      AUTH_COOKIE_SECURE: 'true',
      BLOB_STORE_ID: 'store_8u9fq5re0OENMRtC',
      NODE_ENV: 'production',
      REDIS_NAMESPACE: 'dall-fit:production',
      REDIS_URL: 'rediss://redis.example.test:6379',
      TRUST_PROXY_HOPS: '1',
    };

    expect(validateEnvironment(productionEnvironment)).toMatchObject({
      BLOB_STORE_ID: 'store_8u9fq5re0OENMRtC',
    });
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        BLOB_STORE_ID: undefined,
      }),
    ).toThrow('BLOB_STORE_ID is required in production and preview');
  });

  it('rejects disabled or unbounded rate limit settings', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        RATE_LIMIT_GOOGLE_START_LIMIT: '0',
        RATE_LIMIT_SESSION_WINDOW_MS: '999',
      }),
    ).toThrow('RATE_LIMIT_GOOGLE_START_LIMIT');
  });
});
