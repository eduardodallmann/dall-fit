import { Injectable, Logger } from '@nestjs/common';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly redisKeyService: RedisKeyService,
  ) {}

  async consume(
    bucket: string,
    identifier: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    this.logger.log('RateLimitService -> consume -> params:', {
      params: { bucket, limit, windowMs },
    });
    const key = this.redisKeyService.create('rate', `${bucket}:${identifier}`);
    const response = await this.redisClientService.execute((client) =>
      client.eval(RATE_LIMIT_SCRIPT, 1, key, windowMs),
    );
    if (!Array.isArray(response)) {
      throw new Error('Rate limit response is invalid.');
    }
    const count = Number(response[0]);
    const ttlMs = Math.max(Number(response[1]), 0);
    const result = {
      allowed: count <= limit,
      retryAfterSeconds: Math.max(Math.ceil(ttlMs / 1000), 1),
    };
    this.logger.log('RateLimitService -> consume -> return:', {
      data: { allowed: result.allowed, bucket },
    });

    return result;
  }
}
