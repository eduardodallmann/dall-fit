import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisKeyService {
  private readonly logger = new Logger(RedisKeyService.name);
  private readonly namespace: string;

  constructor(configService: ConfigService) {
    this.namespace = configService.getOrThrow<string>('REDIS_NAMESPACE');
  }

  create(
    subject:
      | 'assistant-provider-circuit'
      | 'offline-training-lease'
      | 'rate'
      | 'realtime'
      | 'session'
      | 'workout-completion-receipt'
      | 'workout-session'
      | 'workout-session-expiry',
    identifier: string,
  ): string {
    this.logger.log('RedisKeyService -> create -> params:', {
      params: { subject },
    });

    const result = `${this.namespace}:${subject}:${identifier}`;
    this.logger.log('RedisKeyService -> create -> return:', {
      data: { keyCreated: true, subject },
    });

    return result;
  }
}
