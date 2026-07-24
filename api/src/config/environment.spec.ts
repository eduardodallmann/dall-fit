import { describe, expect, it } from 'vitest';

import { validateEnvironment } from '~/config/environment';

describe('validateEnvironment', () => {
  it('applies safe local defaults', () => {
    const result = validateEnvironment({});

    expect(result).toMatchObject({
      PORT: 4000,
      CORS_ORIGIN: 'http://localhost:3000',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/dall-fit',
      REDIS_URL: 'redis://127.0.0.1:6379',
    });
  });

  it('coerces the port and preserves predefined environment variables', () => {
    const result = validateEnvironment({
      PORT: '4100',
      SYSTEM_VARIABLE: 'preserved',
    });

    expect(result.PORT).toBe(4100);
    expect(result.SYSTEM_VARIABLE).toBe('preserved');
  });

  it('reports every invalid environment variable without exposing its value', () => {
    expect(() =>
      validateEnvironment({
        PORT: 'invalid',
        CORS_ORIGIN: 'invalid',
        MONGODB_URI: 'postgresql://localhost/dall-fit',
        REDIS_URL: 'http://localhost:6379',
      }),
    ).toThrow(
      'Invalid environment variables: PORT: Invalid input: expected number, received NaN; CORS_ORIGIN: Invalid URL; MONGODB_URI: must use the mongodb:// or mongodb+srv:// protocol; REDIS_URL: must use the redis:// or rediss:// protocol',
    );
  });
});
