import { Global, Module } from '@nestjs/common';

import { RateLimitService } from '~/redis/rate-limit.service';
import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';
import { SessionStoreService } from '~/redis/session-store.service';

@Global()
@Module({
  providers: [
    RateLimitService,
    RedisClientService,
    RedisKeyService,
    SessionStoreService,
  ],
  exports: [RateLimitService, RedisClientService, SessionStoreService],
})
export class RedisModule {}
