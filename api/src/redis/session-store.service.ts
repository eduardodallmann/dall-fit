import { Injectable, Logger } from '@nestjs/common';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';

export interface StoredSession {
  csrfToken: string;
  expiresAt: number;
  personId: string;
}

@Injectable()
export class SessionStoreService {
  private readonly logger = new Logger(SessionStoreService.name);

  constructor(
    private readonly redisClientService: RedisClientService,
    private readonly redisKeyService: RedisKeyService,
  ) {}

  async create(jti: string, session: StoredSession): Promise<void> {
    this.logger.log('SessionStoreService -> create -> params:', {
      params: { expiresAt: session.expiresAt, personId: session.personId },
    });
    const key = this.redisKeyService.create('session', jti);
    const value = JSON.stringify(session);
    await this.redisClientService.execute((client) =>
      client
        .set(key, value, 'PXAT', session.expiresAt * 1000, 'NX')
        .then((reply) => {
          if (reply !== 'OK') {
            throw new Error('Session identifier already exists.');
          }
        }),
    );
    this.logger.log('SessionStoreService -> create -> completed:', {
      data: { personId: session.personId },
    });
  }

  async find(jti: string): Promise<StoredSession | null> {
    this.logger.log('SessionStoreService -> find -> params:', {
      params: { sessionIdentifierPresent: jti.length > 0 },
    });
    const key = this.redisKeyService.create('session', jti);
    const value = await this.redisClientService.execute((client) =>
      client.get(key),
    );
    const result = value === null ? null : parseStoredSession(value);
    this.logger.log('SessionStoreService -> find -> return:', {
      data: { found: result !== null },
    });

    return result;
  }

  async delete(jti: string): Promise<void> {
    this.logger.log('SessionStoreService -> delete -> params:', {
      params: { sessionIdentifierPresent: jti.length > 0 },
    });
    const key = this.redisKeyService.create('session', jti);
    const deleted = await this.redisClientService.execute((client) =>
      client.del(key),
    );
    this.logger.log('SessionStoreService -> delete -> completed:', {
      data: { deleted: deleted > 0 },
    });
  }
}

function parseStoredSession(value: string): StoredSession {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('csrfToken' in parsed) ||
    typeof parsed.csrfToken !== 'string' ||
    !('expiresAt' in parsed) ||
    typeof parsed.expiresAt !== 'number' ||
    !('personId' in parsed) ||
    typeof parsed.personId !== 'string'
  ) {
    throw new Error('Stored session is invalid.');
  }

  return {
    csrfToken: parsed.csrfToken,
    expiresAt: parsed.expiresAt,
    personId: parsed.personId,
  };
}
