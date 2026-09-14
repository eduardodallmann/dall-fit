import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';
import { RedisUnavailableError } from '~/redis/redis.errors';
import { OFFLINE_TRAINING_SNAPSHOT_LOCK_TTL_MS } from '~/training/domain/offline-training-snapshot.types';
import {
  OfflineTrainingSnapshotSyncInProgressError,
  OfflineTrainingSnapshotUnavailableError,
} from '~/training/errors/offline-training-snapshot.errors';

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface OfflineTrainingSnapshotLock {
  key: string;
  token: string;
}

@Injectable()
export class OfflineTrainingSnapshotLockService {
  private readonly logger = new Logger(OfflineTrainingSnapshotLockService.name);

  constructor(
    private readonly redis: RedisClientService,
    private readonly keys: RedisKeyService,
  ) {}

  async acquire(installationId: string): Promise<OfflineTrainingSnapshotLock> {
    this.logger.log(
      'OfflineTrainingSnapshotLockService -> acquire -> params:',
      { params: { operation: 'acquire' } },
    );
    const key = this.keys.create(
      'offline-training-snapshot-lock',
      installationId,
    );
    const token = randomUUID();
    try {
      const outcome = await this.redis.execute((client) =>
        client.set(
          key,
          token,
          'PX',
          OFFLINE_TRAINING_SNAPSHOT_LOCK_TTL_MS,
          'NX',
        ),
      );
      this.logger.log(
        'OfflineTrainingSnapshotLockService -> acquire -> redis return:',
        { data: { acquired: outcome === 'OK' } },
      );
      if (outcome !== 'OK') {
        this.logger.warn(
          'OfflineTrainingSnapshotLockService -> acquire -> contended error:',
          { data: { code: 'OFFLINE_TRAINING_SYNC_IN_PROGRESS' } },
        );
        throw new OfflineTrainingSnapshotSyncInProgressError();
      }
      const result = { key, token };
      this.logger.log(
        'OfflineTrainingSnapshotLockService -> acquire -> return:',
        { data: { acquired: true } },
      );
      return result;
    } catch (error: unknown) {
      if (error instanceof OfflineTrainingSnapshotSyncInProgressError) {
        throw error;
      }
      this.logger.error(
        'OfflineTrainingSnapshotLockService -> acquire -> unavailable error:',
        {
          data: {
            errorName:
              error instanceof RedisUnavailableError
                ? RedisUnavailableError.name
                : 'InvalidRedisResponse',
          },
        },
      );
      throw new OfflineTrainingSnapshotUnavailableError();
    }
  }

  async release(lock: OfflineTrainingSnapshotLock): Promise<void> {
    this.logger.log(
      'OfflineTrainingSnapshotLockService -> release -> params:',
      { params: { operation: 'release' } },
    );
    try {
      const outcome = await this.redis.execute((client) =>
        client.eval(RELEASE_SCRIPT, 1, lock.key, lock.token),
      );
      this.logger.log(
        'OfflineTrainingSnapshotLockService -> release -> redis return:',
        { data: { released: outcome === 1 } },
      );
      this.logger.log(
        'OfflineTrainingSnapshotLockService -> release -> completed:',
        { data: { released: outcome === 1 } },
      );
    } catch (error: unknown) {
      this.logger.error(
        'OfflineTrainingSnapshotLockService -> release -> unavailable error:',
        {
          data: {
            errorName:
              error instanceof RedisUnavailableError
                ? RedisUnavailableError.name
                : 'InvalidRedisResponse',
          },
        },
      );
      throw new OfflineTrainingSnapshotUnavailableError();
    }
  }
}
