import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { attachDatabasePool } from '@vercel/functions';
import Redis from 'ioredis';

import { RedisUnavailableError } from '~/redis/redis.errors';

@Injectable()
export class RedisClientService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(RedisClientService.name);
  private readonly client: Redis;
  private readonly usesVercelLifecycle: boolean;

  constructor(configService: ConfigService) {
    const redisUrl = configService.getOrThrow<string>('REDIS_URL');
    const connectTimeout = configService.getOrThrow<number>(
      'REDIS_CONNECT_TIMEOUT_MS',
    );
    const commandTimeout = configService.getOrThrow<number>(
      'REDIS_COMMAND_TIMEOUT_MS',
    );

    this.client = new Redis(redisUrl, {
      commandTimeout,
      connectTimeout,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      reconnectOnError: () => false,
      retryStrategy: (attempt) =>
        attempt <= 2 ? Math.min(attempt * 100, 250) : null,
    });
    this.client.on('error', (error: Error) => {
      this.logger.error('RedisClientService -> client -> error:', {
        data: { errorName: error.name },
      });
    });

    this.usesVercelLifecycle =
      configService.get<string>('VERCEL') !== undefined;
    if (this.usesVercelLifecycle) {
      attachDatabasePool({
        on: this.client.on.bind(this.client),
        options: { socket: true },
        status: this.client.status,
      });
    }
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('RedisClientService -> onModuleInit -> params:', {
      params: { usesVercelLifecycle: this.usesVercelLifecycle },
    });

    try {
      await this.client.connect();
      const pong = await this.client.ping();
      this.logger.log('RedisClientService -> onModuleInit -> ping return:', {
        data: { ready: pong === 'PONG' },
      });
      if (pong !== 'PONG') {
        throw new RedisUnavailableError();
      }
    } catch (error: unknown) {
      this.logger.error('RedisClientService -> onModuleInit -> failed:', {
        data: {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      });
      this.client.disconnect(false);
      throw new RedisUnavailableError();
    }

    this.logger.log('RedisClientService -> onModuleInit -> completed:', {
      data: { ready: true },
    });
  }

  async execute<T>(operation: (client: Redis) => Promise<T>): Promise<T> {
    this.logger.log('RedisClientService -> execute -> params:', {
      params: { operationProvided: true },
    });

    try {
      const operationResult = await operation(this.client);
      this.logger.log('RedisClientService -> execute -> operation return:', {
        data: { completed: true },
      });
      const result = operationResult;
      this.logger.log('RedisClientService -> execute -> return:', {
        data: { completed: true },
      });

      return result;
    } catch (error: unknown) {
      this.logger.error('RedisClientService -> execute -> failed:', {
        data: {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      });
      throw new RedisUnavailableError();
    }
  }

  async ping(): Promise<void> {
    this.logger.log('RedisClientService -> ping -> params:', {
      params: {},
    });
    const pong = await this.execute((client) => client.ping());
    this.logger.log('RedisClientService -> ping -> execute return:', {
      data: { ready: pong === 'PONG' },
    });
    if (pong !== 'PONG') {
      this.logger.warn('RedisClientService -> ping -> unexpected response:', {
        data: { ready: false },
      });
      throw new RedisUnavailableError();
    }
    this.logger.log('RedisClientService -> ping -> completed:', {
      data: { ready: true },
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('RedisClientService -> onModuleDestroy -> params:', {
      params: {},
    });

    if (this.client.status === 'ready') {
      await this.client.quit();
    } else {
      this.client.disconnect(false);
    }

    this.logger.log('RedisClientService -> onModuleDestroy -> completed:', {
      data: { closed: true },
    });
  }
}
