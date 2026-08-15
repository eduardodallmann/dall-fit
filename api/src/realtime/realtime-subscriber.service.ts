import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { attachDatabasePool } from '@vercel/functions';
import Redis from 'ioredis';

import { REALTIME_CHANNEL_SUFFIX } from '~/realtime/realtime.constants';
import type { InternalRealtimeEvent } from '~/realtime/realtime.types';
import { RedisKeyService } from '~/redis/redis-key.service';

type RealtimeMessageListener = (event: InternalRealtimeEvent) => void;

@Injectable()
export class RealtimeSubscriberService
  implements OnModuleDestroy, OnModuleInit
{
  private readonly channel: string;
  private readonly client: Redis;
  private readonly listeners = new Set<RealtimeMessageListener>();
  private readonly logger = new Logger(RealtimeSubscriberService.name);

  constructor(configService: ConfigService, redisKeyService: RedisKeyService) {
    this.channel = redisKeyService.create('realtime', REALTIME_CHANNEL_SUFFIX);
    this.client = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      connectTimeout: configService.getOrThrow<number>(
        'REDIS_CONNECT_TIMEOUT_MS',
      ),
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: (attempt) =>
        attempt <= 10 ? Math.min(attempt * 250, 5_000) : null,
    });
    this.client.on('error', (error: Error) => {
      this.logger.error('RealtimeSubscriberService -> client -> error:', {
        data: { errorName: error.name },
      });
    });
    this.client.on('message', (channel, message) => {
      if (channel !== this.channel) return;
      this.dispatch(message);
    });
    if (configService.get<string>('VERCEL') !== undefined) {
      attachDatabasePool({
        on: this.client.on.bind(this.client),
        options: { socket: true },
        status: this.client.status,
      });
    }
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('RealtimeSubscriberService -> onModuleInit -> params:', {
      params: {},
    });
    await this.client.connect();
    const subscriptions = await this.client.subscribe(this.channel);
    this.logger.log(
      'RealtimeSubscriberService -> onModuleInit -> subscribe return:',
      { data: { subscriptions } },
    );
    this.logger.log('RealtimeSubscriberService -> onModuleInit -> completed:', {
      data: { subscribed: true },
    });
  }

  subscribe(listener: RealtimeMessageListener): () => void {
    this.logger.log('RealtimeSubscriberService -> subscribe -> params:', {
      params: { listenerProvided: true },
    });
    this.listeners.add(listener);
    const result = () => this.listeners.delete(listener);
    this.logger.log('RealtimeSubscriberService -> subscribe -> return:', {
      data: { listenerCount: this.listeners.size },
    });
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('RealtimeSubscriberService -> onModuleDestroy -> params:', {
      params: {},
    });
    if (this.client.status === 'ready') await this.client.quit();
    else this.client.disconnect(false);
    this.logger.log(
      'RealtimeSubscriberService -> onModuleDestroy -> completed:',
      { data: { closed: true } },
    );
  }

  private dispatch(message: string): void {
    this.logger.log('RealtimeSubscriberService -> dispatch -> params:', {
      params: { messagePresent: message.length > 0 },
    });
    try {
      const parsed = JSON.parse(message) as InternalRealtimeEvent;
      if (
        parsed.audience !== 'admin' ||
        parsed.event?.resource !== 'global-training-plan' ||
        typeof parsed.event.resourceId !== 'string' ||
        parsed.event.resourceId.length === 0 ||
        !['deleted', 'present'].includes(parsed.event.state) ||
        (parsed.event.state === 'present' &&
          (!Number.isInteger(parsed.event.version) || parsed.event.version < 0))
      ) {
        this.logger.warn(
          'RealtimeSubscriberService -> dispatch -> unsupported branch:',
          { data: { accepted: false } },
        );
        return;
      }
      for (const listener of this.listeners) listener(parsed);
      this.logger.log('RealtimeSubscriberService -> dispatch -> completed:', {
        data: { listenerCount: this.listeners.size },
      });
    } catch (error: unknown) {
      this.logger.warn('RealtimeSubscriberService -> dispatch -> invalid:', {
        data: {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      });
    }
  }
}
