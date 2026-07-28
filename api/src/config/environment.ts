import { z } from 'zod';

const booleanString = z
  .enum(['false', 'true'])
  .transform((value) => value === 'true');

const environmentSchema = z.looseObject({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGIN: z.url().default('http://localhost:3000'),
  UI_URL: z.url().default('http://localhost:3000'),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(?:\+srv)?:\/\/.+/, {
      message: 'must use the mongodb:// or mongodb+srv:// protocol',
    })
    .default('mongodb://127.0.0.1:27017/dall-fit'),
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\/.+/, {
      message: 'must use the redis:// or rediss:// protocol',
    })
    .default('redis://127.0.0.1:6379'),
  GOOGLE_OAUTH_CREDENTIALS_BASE64: z.string().min(1),
  AUTH_SESSION_SECRET: z.string().min(32),
  AUTH_SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(2_592_000)
    .default(604_800),
  AUTH_COOKIE_SECURE: booleanString.default(false),
  AUTH_TEST_BYPASS_ENABLED: booleanString.default(false),
  AUTH_TEST_BYPASS_KEY: z.string().min(16).optional(),
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

type ParsedEnvironment = z.infer<typeof environmentSchema>;
type EnvironmentVariables = ParsedEnvironment & {
  GOOGLE_OAUTH_CREDENTIALS: GoogleOAuthCredentials;
};

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validation = environmentSchema.safeParse(config);

  if (!validation.success) {
    throwValidationError(validation.error);
  }

  const parsed = validation.data;
  validateSecurityCombinations(parsed);
  const googleCredentials = parseGoogleCredentials(
    parsed.GOOGLE_OAUTH_CREDENTIALS_BASE64,
  );

  const result = {
    ...parsed,
    GOOGLE_OAUTH_CREDENTIALS: googleCredentials,
  };

  return result;
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

function validateSecurityCombinations(config: ParsedEnvironment): void {
  if (
    config.AUTH_TEST_BYPASS_ENABLED &&
    config.AUTH_TEST_BYPASS_KEY === undefined
  ) {
    throw new Error(
      'Invalid environment variables: AUTH_TEST_BYPASS_KEY: required when AUTH_TEST_BYPASS_ENABLED is true',
    );
  }

  if (config.NODE_ENV === 'production' && config.AUTH_TEST_BYPASS_ENABLED) {
    throw new Error(
      'Invalid environment variables: AUTH_TEST_BYPASS_ENABLED: cannot be true in production',
    );
  }

  if (config.NODE_ENV === 'production' && !config.AUTH_COOKIE_SECURE) {
    throw new Error(
      'Invalid environment variables: AUTH_COOKIE_SECURE: must be true in production',
    );
  }
}
