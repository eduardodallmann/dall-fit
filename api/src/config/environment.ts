import { z } from 'zod';

const environmentSchema = z.looseObject({
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGIN: z.url().default('http://localhost:3000'),
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
});

type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validation = environmentSchema.safeParse(config);

  if (!validation.success) {
    const issues = validation.error.issues
      .map(({ message, path }) => `${path.join('.')}: ${message}`)
      .join('; ');

    throw new Error(`Invalid environment variables: ${issues}`);
  }

  return validation.data;
}
