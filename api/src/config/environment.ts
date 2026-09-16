import { createHash } from 'node:crypto';

import { LOG_LEVELS } from '@nestjs/common';
import { z } from 'zod';

const booleanString = z
  .enum(['false', 'true'])
  .transform((value) => value === 'true');

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(32).optional(),
);

const androidPlayStoreUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    url.hostname === 'play.google.com' &&
    url.pathname === '/store/apps/details' &&
    url.searchParams.get('id') === 'com.dallfit.app'
  );
}, 'must be the HTTPS Google Play listing for com.dallfit.app');

const environmentSchema = z.looseObject({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  CI: optionalNonEmptyString,
  VERCEL: optionalNonEmptyString,
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  VERCEL_URL: optionalNonEmptyString,
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  ANDROID_MIN_VERSION_CODE: z.coerce.number().int().positive(),
  ANDROID_PLAY_STORE_URL: androidPlayStoreUrl,
  LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  CORS_ORIGIN: z.url().default('http://localhost:3000'),
  UI_URL: z.url().default('http://localhost:3000'),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(?:\+srv)?:\/\/.+/, {
      message: 'must use the mongodb:// or mongodb+srv:// protocol',
    })
    .default('mongodb://127.0.0.1:27017/dall-fit'),
  REDIS_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^rediss?:\/\/.+/, {
        message: 'must use the redis:// or rediss:// protocol',
      })
      .optional(),
  ),
  REDIS_NAMESPACE: optionalNonEmptyString,
  REDIS_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10_000)
    .default(2_000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10_000)
    .default(1_500),
  RATE_LIMIT_GOOGLE_START_LIMIT: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_GOOGLE_START_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(600_000),
  RATE_LIMIT_GOOGLE_CALLBACK_LIMIT: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_GOOGLE_CALLBACK_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(600_000),
  RATE_LIMIT_NATIVE_SESSION_LIMIT: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_NATIVE_SESSION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(600_000),
  RATE_LIMIT_APP_COMPATIBILITY_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(60),
  RATE_LIMIT_APP_COMPATIBILITY_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_TEST_LOGIN_LIMIT: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_TEST_LOGIN_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_SESSION_LIMIT: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_SESSION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_REALTIME_CONNECTION_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(30),
  RATE_LIMIT_REALTIME_CONNECTION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_AUTHENTICATED_MUTATION_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(60),
  RATE_LIMIT_AUTHENTICATED_MUTATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_ADMIN_MUTATION_LIMIT: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_ADMIN_MUTATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_EDITOR_MUTATION_LIMIT: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_EDITOR_MUTATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_IMAGE_MUTATION_LIMIT: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_IMAGE_MUTATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_TRAINING_MUTATION_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(240),
  RATE_LIMIT_TRAINING_MUTATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_TRAINING_LIFECYCLE_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(30),
  RATE_LIMIT_TRAINING_LIFECYCLE_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  RATE_LIMIT_ASSISTANT_MESSAGE_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(40),
  RATE_LIMIT_ASSISTANT_MESSAGE_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(600_000),
  RATE_LIMIT_ASSISTANT_DRAFT_LIMIT: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_ASSISTANT_DRAFT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(600_000),
  RATE_LIMIT_ASSISTANT_CONFIRM_LIMIT: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_ASSISTANT_CONFIRM_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(600_000),
  YOUTUBE_VALIDATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10_000)
    .default(2_000),
  BLOB_STORE_ID: optionalNonEmptyString,
  WORKFLOW_BASE_URL: z.url().default('http://localhost:5000'),
  WORKFLOW_PROJECT_NAME: z.string().min(1).default('dall-fit-workflow'),
  WORKFLOW_HMAC_SECRET: optionalSecret,
  WORKFLOW_PROTECTION_BYPASS_SECRET: optionalNonEmptyString,
  WORKFLOW_START_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(5_000),
  TRAINING_PLAN_ASSISTANT_ENABLED: booleanString.default(false),
  TRAINING_PLAN_ASSISTANT_PROVIDER: z.enum(['fake', 'groq']).default('fake'),
  TRAINING_PLAN_ASSISTANT_MODEL: z
    .string()
    .min(1)
    .default('llama-3.3-70b-versatile'),
  TRAINING_PLAN_ASSISTANT_GROQ_API_KEY: optionalNonEmptyString,
  TRAINING_PLAN_ASSISTANT_ZDR_CONFIRMED: booleanString.default(false),
  TRAINING_PLAN_ASSISTANT_PRIVACY_APPROVED: booleanString.default(false),
  TRAINING_PLAN_ASSISTANT_PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(30_000),
  TRAINING_PLAN_ASSISTANT_MAX_COMPLETION_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(8_192)
    .default(4_096),
  GOOGLE_OAUTH_CREDENTIALS_BASE64: z.string().min(1),
  AUTH_SESSION_SECRET: z.string().min(32),
  AUTH_SESSION_ACTIVE_KEY_ID: z.string().min(1).default('active-v1'),
  AUTH_SESSION_PREVIOUS_SECRET: optionalSecret,
  AUTH_SESSION_PREVIOUS_KEY_ID: optionalNonEmptyString,
  AUTH_SESSION_PREVIOUS_VALID_UNTIL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.date().optional(),
  ),
  AUTH_SESSION_ISSUER: z.string().min(1).default('dall-fit-api'),
  AUTH_SESSION_AUDIENCE: z.string().min(1).default('dall-fit-ui'),
  AUTH_NATIVE_SESSION_AUDIENCE: z.string().min(1).default('dall-fit-android'),
  AUTH_SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(604_800)
    .default(604_800),
  AUTH_COOKIE_SECURE: booleanString.default(false),
  AUTH_TEST_BYPASS_ENABLED: booleanString.default(false),
  AUTH_TEST_BYPASS_E2E_ENABLED: booleanString.default(false),
  AUTH_TEST_BYPASS_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(43).optional(),
  ),
});

const googleCredentialsDocumentSchema = z.object({
  web: z.object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    redirect_uris: z.array(z.url()).min(1),
  }),
});

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export type RuntimeEnvironment = 'local' | 'preview' | 'production' | 'test';

type ParsedEnvironment = z.infer<typeof environmentSchema>;
type EnvironmentVariables = ParsedEnvironment & {
  BLOB_STORE_ID: string;
  GOOGLE_OAUTH_CREDENTIALS: GoogleOAuthCredentials;
  REDIS_NAMESPACE: string;
  REDIS_URL: string;
  RUNTIME_ENVIRONMENT: RuntimeEnvironment;
};

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validation = environmentSchema.safeParse(config);

  if (!validation.success) {
    throwValidationError(validation.error);
  }

  const parsed = validation.data;
  const runtimeEnvironment = resolveRuntimeEnvironment(parsed);
  validateSecurityCombinations(parsed, runtimeEnvironment);
  const googleCredentials = parseGoogleCredentials(
    parsed.GOOGLE_OAUTH_CREDENTIALS_BASE64,
  );
  const redisUrl = resolveRedisUrl(parsed, runtimeEnvironment);
  const redisNamespace = resolveRedisNamespace(parsed, runtimeEnvironment);
  const blob = resolveBlobConfiguration(parsed, runtimeEnvironment);
  const workflow = resolveWorkflowConfiguration(parsed, runtimeEnvironment);

  const result = {
    ...parsed,
    ...blob,
    ...workflow,
    GOOGLE_OAUTH_CREDENTIALS: googleCredentials,
    REDIS_NAMESPACE: redisNamespace,
    REDIS_URL: redisUrl,
    RUNTIME_ENVIRONMENT: runtimeEnvironment,
  };

  return result;
}

function resolveWorkflowConfiguration(
  config: ParsedEnvironment,
  runtimeEnvironment: RuntimeEnvironment,
): { WORKFLOW_HMAC_SECRET: string } {
  if (
    (runtimeEnvironment === 'preview' || runtimeEnvironment === 'production') &&
    config.WORKFLOW_HMAC_SECRET === undefined
  )
    throw new Error(
      'Invalid environment variables: WORKFLOW_HMAC_SECRET is required in production and preview',
    );
  const result = {
    WORKFLOW_HMAC_SECRET:
      config.WORKFLOW_HMAC_SECRET ??
      'local-workflow-hmac-secret-change-me-000000000000',
  };
  return result;
}

function resolveBlobConfiguration(
  config: ParsedEnvironment,
  runtimeEnvironment: RuntimeEnvironment,
): { BLOB_STORE_ID: string } {
  if (
    (runtimeEnvironment === 'preview' || runtimeEnvironment === 'production') &&
    config.BLOB_STORE_ID === undefined
  ) {
    throw new Error(
      'Invalid environment variables: BLOB_STORE_ID is required in production and preview',
    );
  }
  return {
    BLOB_STORE_ID: config.BLOB_STORE_ID ?? 'local-blob-store-not-configured',
  };
}

function resolveRuntimeEnvironment(
  config: ParsedEnvironment,
): RuntimeEnvironment {
  if (config.VERCEL_ENV === 'preview') {
    return 'preview';
  }

  if (config.VERCEL_ENV === 'production' || config.NODE_ENV === 'production') {
    return 'production';
  }

  const result = config.NODE_ENV === 'test' ? 'test' : 'local';

  return result;
}

function resolveRedisUrl(
  config: ParsedEnvironment,
  runtimeEnvironment: RuntimeEnvironment,
): string {
  const redisUrl = config.REDIS_URL;
  if (redisUrl === undefined) {
    if (
      runtimeEnvironment === 'production' ||
      runtimeEnvironment === 'preview'
    ) {
      throw new Error(
        'Invalid environment variables: REDIS_URL: required in production and preview',
      );
    }

    return 'redis://127.0.0.1:6379';
  }

  if (!/^rediss?:\/\/.+/.test(redisUrl)) {
    throw new Error(
      'Invalid environment variables: REDIS_URL: must use the redis:// or rediss:// protocol',
    );
  }

  if (
    (runtimeEnvironment === 'production' || runtimeEnvironment === 'preview') &&
    !redisUrl.startsWith('rediss://')
  ) {
    throw new Error(
      'Invalid environment variables: REDIS_URL: must use TLS in production and preview',
    );
  }

  return redisUrl;
}

function resolveRedisNamespace(
  config: ParsedEnvironment,
  runtimeEnvironment: RuntimeEnvironment,
): string {
  if (runtimeEnvironment === 'preview') {
    if (
      config.REDIS_NAMESPACE === undefined ||
      config.VERCEL_URL === undefined
    ) {
      throw new Error(
        'Invalid environment variables: REDIS_NAMESPACE and VERCEL_URL are required in preview',
      );
    }

    const deployment = createHash('sha256')
      .update(config.VERCEL_URL)
      .digest('hex')
      .slice(0, 16);
    return `${config.REDIS_NAMESPACE}:preview:${deployment}`;
  }

  if (runtimeEnvironment === 'production') {
    if (config.REDIS_NAMESPACE === undefined) {
      throw new Error(
        'Invalid environment variables: REDIS_NAMESPACE: required in production',
      );
    }

    return `${config.REDIS_NAMESPACE}:production`;
  }

  const base = config.REDIS_NAMESPACE ?? 'dall-fit';
  return `${base}:${runtimeEnvironment}`;
}

function parseGoogleCredentials(value: string): GoogleOAuthCredentials {
  let document: unknown;

  try {
    const json = Buffer.from(value, 'base64').toString('utf8');
    document = JSON.parse(json);
  } catch {
    throw new Error(
      'Invalid environment variables: GOOGLE_OAUTH_CREDENTIALS_BASE64: must be a base64-encoded Google OAuth JSON document',
    );
  }

  const validation = googleCredentialsDocumentSchema.safeParse(document);
  if (!validation.success) {
    throw new Error(
      'Invalid environment variables: GOOGLE_OAUTH_CREDENTIALS_BASE64: decoded document must contain web.client_id, web.client_secret and web.redirect_uris',
    );
  }

  const result = {
    clientId: validation.data.web.client_id,
    clientSecret: validation.data.web.client_secret,
    redirectUri: validation.data.web.redirect_uris[0],
  };

  return result;
}

function throwValidationError(error: z.ZodError): never {
  const issues = error.issues
    .map(({ message, path }) => `${path.join('.')}: ${message}`)
    .join('; ');

  throw new Error(`Invalid environment variables: ${issues}`);
}

function validateSecurityCombinations(
  config: ParsedEnvironment,
  runtimeEnvironment: RuntimeEnvironment,
): void {
  validateAssistantSecurityCombination(config, runtimeEnvironment);
  validateAuthSecurityCombinations(config, runtimeEnvironment);
}

function validateAssistantSecurityCombination(
  config: ParsedEnvironment,
  runtimeEnvironment: RuntimeEnvironment,
): void {
  if (
    config.TRAINING_PLAN_ASSISTANT_ENABLED &&
    (runtimeEnvironment === 'production' || runtimeEnvironment === 'preview') &&
    (config.TRAINING_PLAN_ASSISTANT_PROVIDER !== 'groq' ||
      config.TRAINING_PLAN_ASSISTANT_GROQ_API_KEY === undefined ||
      !config.TRAINING_PLAN_ASSISTANT_ZDR_CONFIRMED ||
      !config.TRAINING_PLAN_ASSISTANT_PRIVACY_APPROVED)
  ) {
    throw new Error(
      'Invalid environment variables: the training plan assistant requires Groq credentials, ZDR confirmation and privacy approval in production and preview',
    );
  }
}

function validateAuthSecurityCombinations(
  config: ParsedEnvironment,
  runtimeEnvironment: RuntimeEnvironment,
): void {
  validateSessionAudiences(config);

  if (
    config.AUTH_TEST_BYPASS_ENABLED &&
    config.AUTH_TEST_BYPASS_KEY === undefined
  ) {
    throw new Error(
      'Invalid environment variables: AUTH_TEST_BYPASS_KEY: required when AUTH_TEST_BYPASS_ENABLED is true',
    );
  }

  if (
    config.AUTH_TEST_BYPASS_E2E_ENABLED &&
    (runtimeEnvironment !== 'test' || !config.AUTH_TEST_BYPASS_ENABLED)
  ) {
    throw new Error(
      'Invalid environment variables: AUTH_TEST_BYPASS_E2E_ENABLED: allowed only with the bypass enabled in the test runtime',
    );
  }

  if (
    config.AUTH_TEST_BYPASS_ENABLED &&
    (runtimeEnvironment === 'production' ||
      runtimeEnvironment === 'preview' ||
      config.VERCEL !== undefined ||
      (config.CI !== undefined && !config.AUTH_TEST_BYPASS_E2E_ENABLED))
  ) {
    throw new Error(
      'Invalid environment variables: AUTH_TEST_BYPASS_ENABLED: allowed only in local or test runtimes outside Vercel and non-E2E CI',
    );
  }

  if (
    (runtimeEnvironment === 'production' || runtimeEnvironment === 'preview') &&
    !config.AUTH_COOKIE_SECURE
  ) {
    throw new Error(
      'Invalid environment variables: AUTH_COOKIE_SECURE: must be true in production and preview',
    );
  }

  if (
    (runtimeEnvironment === 'production' || runtimeEnvironment === 'preview') &&
    config.TRUST_PROXY_HOPS === 0
  ) {
    throw new Error(
      'Invalid environment variables: TRUST_PROXY_HOPS: must explicitly trust the platform proxy in production and preview',
    );
  }

  const previousValues = [
    config.AUTH_SESSION_PREVIOUS_SECRET,
    config.AUTH_SESSION_PREVIOUS_KEY_ID,
    config.AUTH_SESSION_PREVIOUS_VALID_UNTIL,
  ];
  if (
    previousValues.some((value) => value !== undefined) &&
    previousValues.some((value) => value === undefined)
  ) {
    throw new Error(
      'Invalid environment variables: previous session key secret, id and validity must be configured together',
    );
  }

  if (
    config.AUTH_SESSION_PREVIOUS_VALID_UNTIL !== undefined &&
    config.AUTH_SESSION_PREVIOUS_VALID_UNTIL.getTime() >
      Date.now() + config.AUTH_SESSION_TTL_SECONDS * 1000
  ) {
    throw new Error(
      'Invalid environment variables: AUTH_SESSION_PREVIOUS_VALID_UNTIL cannot exceed the maximum session lifetime',
    );
  }
}

function validateSessionAudiences(config: ParsedEnvironment): void {
  if (config.AUTH_NATIVE_SESSION_AUDIENCE === config.AUTH_SESSION_AUDIENCE) {
    throw new Error(
      'Invalid environment variables: AUTH_NATIVE_SESSION_AUDIENCE must differ from AUTH_SESSION_AUDIENCE',
    );
  }
}
