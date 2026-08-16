import { Inject, Injectable, Logger } from '@nestjs/common';

import type { RealtimeResourceInvalidation } from '@dall-fit/types';

import {
  REQUEST_CONTEXT_STORAGE,
  type RequestContextStorage,
} from '~/observability/request-context';
import { REALTIME_CHANNEL_SUFFIX } from '~/realtime/realtime.constants';
import type { InternalRealtimeEvent } from '~/realtime/realtime.types';
import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';

@Injectable()
export class RealtimePublisherService {
  private readonly channel: string;
  private readonly logger = new Logger(RealtimePublisherService.name);

  constructor(
    private readonly redisClient: RedisClientService,
    redisKeyService: RedisKeyService,
    @Inject(REQUEST_CONTEXT_STORAGE)
    private readonly requestContext: RequestContextStorage,
  ) {
    this.channel = redisKeyService.create('realtime', REALTIME_CHANNEL_SUFFIX);
  }

  async publish(event: RealtimeResourceInvalidation): Promise<void> {
    this.logger.log('RealtimePublisherService -> publish -> params:', {
      params: {
        resource: event.resource,
        resourceId: event.resourceId,
        state: event.state,
      },
    });
    const envelope: InternalRealtimeEvent = {
      audience: 'admin',
      event,
      ...(this.requestContext.getStore()?.clientInstanceId === undefined
        ? {}
        : {
            originClientInstanceId:
              this.requestContext.getStore()?.clientInstanceId,
          }),
    };
    try {
      const subscribers = await this.redisClient.execute((client) =>
        client.publish(this.channel, JSON.stringify(envelope)),
      );
      this.logger.log('RealtimePublisherService -> publish -> redis return:', {
        data: { subscribers },
      });
    } catch (error: unknown) {
      this.logger.warn('RealtimePublisherService -> publish -> failed:', {
        data: {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          resource: event.resource,
          resourceId: event.resourceId,
        },
      });
    }
    this.logger.log('RealtimePublisherService -> publish -> completed:', {
      data: { publishedBestEffort: true },
    });
  }
}
