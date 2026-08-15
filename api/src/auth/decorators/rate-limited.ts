import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'dall-fit:rate-limit';

export type RateLimitSubject =
  'ip' | 'optional-session-ip' | 'person-ip' | 'session-ip';

export type RateLimitLimitConfigKey =
  | 'RATE_LIMIT_ADMIN_MUTATION_LIMIT'
  | 'RATE_LIMIT_EDITOR_MUTATION_LIMIT'
  | 'RATE_LIMIT_IMAGE_MUTATION_LIMIT'
  | 'RATE_LIMIT_AUTHENTICATED_MUTATION_LIMIT'
  | 'RATE_LIMIT_GOOGLE_CALLBACK_LIMIT'
  | 'RATE_LIMIT_GOOGLE_START_LIMIT'
  | 'RATE_LIMIT_SESSION_LIMIT'
  | 'RATE_LIMIT_REALTIME_CONNECTION_LIMIT'
  | 'RATE_LIMIT_TEST_LOGIN_LIMIT';

export type RateLimitWindowConfigKey =
  | 'RATE_LIMIT_ADMIN_MUTATION_WINDOW_MS'
  | 'RATE_LIMIT_EDITOR_MUTATION_WINDOW_MS'
  | 'RATE_LIMIT_IMAGE_MUTATION_WINDOW_MS'
  | 'RATE_LIMIT_AUTHENTICATED_MUTATION_WINDOW_MS'
  | 'RATE_LIMIT_GOOGLE_CALLBACK_WINDOW_MS'
  | 'RATE_LIMIT_GOOGLE_START_WINDOW_MS'
  | 'RATE_LIMIT_SESSION_WINDOW_MS'
  | 'RATE_LIMIT_REALTIME_CONNECTION_WINDOW_MS'
  | 'RATE_LIMIT_TEST_LOGIN_WINDOW_MS';

export interface RateLimitPolicy {
  bucket: string;
  limitConfigKey: RateLimitLimitConfigKey;
  subject: RateLimitSubject;
  windowConfigKey: RateLimitWindowConfigKey;
}

export function RateLimited(policy: RateLimitPolicy): MethodDecorator {
  const result = SetMetadata(RATE_LIMIT_METADATA, policy);

  return result;
}
