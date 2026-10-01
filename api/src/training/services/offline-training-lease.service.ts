import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';
import { RedisUnavailableError } from '~/redis/redis.errors';
import {
  OFFLINE_TRAINING_LEASE_TTL_MS,
  type OfflineTrainingLease,
  type OfflineTrainingLeaseIdentity,
  type OfflineTrainingLeasePublic,
  type OfflineTrainingLeaseState,
} from '~/training/domain/offline-training-lease.types';
import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
  OfflineTrainingLeaseTakeoverRequiredError,
  OfflineTrainingLeaseUnavailableError,
} from '~/training/errors/offline-training-lease.errors';
import { TrainingClockService } from '~/training/services/training-clock.service';

const ACQUIRE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  redis.call('SET', KEYS[1], ARGV[3], 'PXAT', ARGV[2])
  return {'created', ARGV[3]}
end
local current = cjson.decode(raw)
if current.installationId == ARGV[1] then
  return {'unchanged', raw}
end
if ARGV[4] == '1' then
  redis.call('SET', KEYS[1], ARGV[3], 'PXAT', ARGV[2])
  return {'taken-over', ARGV[3]}
end
return {'takeover-required', ''}
`;

const VALIDATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0, ''} end
local current = cjson.decode(raw)
if current.personId ~= ARGV[1] or current.installationId ~= ARGV[2] or current.leaseId ~= ARGV[3] then
  return {-1, ''}
end
return {1, raw}
`;

const RENEW_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {0, ''} end
local current = cjson.decode(raw)
if current.personId ~= ARGV[1] or current.installationId ~= ARGV[2] or current.leaseId ~= ARGV[3] then
  return {-1, ''}
end
redis.call('SET', KEYS[1], ARGV[4], 'PXAT', ARGV[5])
return {1, ARGV[4]}
`;

@Injectable()
export class OfflineTrainingLeaseService {
  private readonly logger = new Logger(OfflineTrainingLeaseService.name);

  constructor(
    private readonly redis: RedisClientService,
    private readonly keys: RedisKeyService,
    private readonly clock: TrainingClockService,
  ) {}

  async register(
    personId: string,
    installationId: string,
  ): Promise<OfflineTrainingLeasePublic> {
    this.logger.log('OfflineTrainingLeaseService -> register -> params:', {
      params: { operation: 'register' },
    });
    const result = await this.acquire(personId, installationId, false);
    this.logger.log(
      'OfflineTrainingLeaseService -> register -> acquire return:',
      {
        data: { state: result.state },
      },
    );
    this.logger.log('OfflineTrainingLeaseService -> register -> return:', {
      data: { state: result.state },
    });
    return result;
  }

  async takeover(
    personId: string,
    installationId: string,
  ): Promise<OfflineTrainingLeasePublic> {
    this.logger.log('OfflineTrainingLeaseService -> takeover -> params:', {
      params: { operation: 'takeover' },
    });
    const result = await this.acquire(personId, installationId, true);
    this.logger.log(
      'OfflineTrainingLeaseService -> takeover -> acquire return:',
      {
        data: { state: result.state },
      },
    );
    this.logger.log('OfflineTrainingLeaseService -> takeover -> return:', {
      data: { state: result.state },
    });
    return result;
  }

  async validate(
    identity: OfflineTrainingLeaseIdentity,
  ): Promise<OfflineTrainingLease> {
    this.logger.log('OfflineTrainingLeaseService -> validate -> params:', {
      params: { operation: 'validate' },
    });
    const key = this.keys.create('offline-training-lease', identity.personId);
    try {
      const raw = await this.redis.execute((client) =>
        client.eval(
          VALIDATE_SCRIPT,
          1,
          key,
          identity.personId,
          identity.installationId,
          identity.leaseId,
        ),
      );
      const [outcome, serialized] = this.parseScriptTuple(raw);
      this.logger.log(
        'OfflineTrainingLeaseService -> validate -> redis return:',
        {
          data: { outcome },
        },
      );
      if (outcome === 0) throw new OfflineTrainingLeaseExpiredError();
      if (outcome !== 1) throw new OfflineTrainingLeaseRevokedError();
      const result = this.parseLease(serialized);
      this.logger.log('OfflineTrainingLeaseService -> validate -> return:', {
        data: { valid: true },
      });
      return result;
    } catch (error: unknown) {
      this.rethrowKnownOrUnavailable(error, 'validate');
    }
  }

  async renewAfterAcceptedSync(
    identity: OfflineTrainingLeaseIdentity,
  ): Promise<OfflineTrainingLease> {
    this.logger.log(
      'OfflineTrainingLeaseService -> renewAfterAcceptedSync -> params:',
      { params: { operation: 'accepted-sync' } },
    );
    const now = this.clock.now();
    const expiresAtMs = now.getTime() + OFFLINE_TRAINING_LEASE_TTL_MS;
    const renewed: OfflineTrainingLease = {
      ...identity,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
    const key = this.keys.create('offline-training-lease', identity.personId);
    try {
      const raw = await this.redis.execute((client) =>
        client.eval(
          RENEW_SCRIPT,
          1,
          key,
          identity.personId,
          identity.installationId,
          identity.leaseId,
          JSON.stringify(renewed),
          String(expiresAtMs),
        ),
      );
      const [outcome, serialized] = this.parseScriptTuple(raw);
      this.logger.log(
        'OfflineTrainingLeaseService -> renewAfterAcceptedSync -> redis return:',
        { data: { outcome } },
      );
      if (outcome === 0) throw new OfflineTrainingLeaseExpiredError();
      if (outcome !== 1) throw new OfflineTrainingLeaseRevokedError();
      const result = this.parseLease(serialized);
      this.logger.log(
        'OfflineTrainingLeaseService -> renewAfterAcceptedSync -> return:',
        { data: { renewed: true } },
      );
      return result;
    } catch (error: unknown) {
      this.rethrowKnownOrUnavailable(error, 'renewAfterAcceptedSync');
    }
  }

  private async acquire(
    personId: string,
    installationId: string,
    takeover: boolean,
  ): Promise<OfflineTrainingLeasePublic> {
    this.logger.log('OfflineTrainingLeaseService -> acquire -> params:', {
      params: { operation: takeover ? 'takeover' : 'register' },
    });
    const now = this.clock.now();
    const expiresAtMs = now.getTime() + OFFLINE_TRAINING_LEASE_TTL_MS;
    const candidate: OfflineTrainingLease = {
      expiresAt: new Date(expiresAtMs).toISOString(),
      installationId,
      leaseId: randomUUID(),
      personId,
    };
    const key = this.keys.create('offline-training-lease', personId);
    try {
      const raw = await this.redis.execute((client) =>
        client.eval(
          ACQUIRE_SCRIPT,
          1,
          key,
          installationId,
          String(expiresAtMs),
          JSON.stringify(candidate),
          takeover ? '1' : '0',
        ),
      );
      const [state, serialized] = this.parseScriptTuple(raw);
      this.logger.log(
        'OfflineTrainingLeaseService -> acquire -> redis return:',
        {
          data: { state },
        },
      );
      if (state === 'takeover-required') {
        throw new OfflineTrainingLeaseTakeoverRequiredError();
      }
      if (!this.isPublicState(state)) throw new Error('Invalid lease state.');
      const lease = this.parseLease(serialized);
      const result = {
        expiresAt: lease.expiresAt,
        leaseId: lease.leaseId,
        state,
      };
      this.logger.log('OfflineTrainingLeaseService -> acquire -> return:', {
        data: { state },
      });
      return result;
    } catch (error: unknown) {
      this.rethrowKnownOrUnavailable(error, 'acquire');
    }
  }

  private parseScriptTuple(raw: unknown): [number | string, string] {
    this.logger.log(
      'OfflineTrainingLeaseService -> parseScriptTuple -> params:',
      { params: { arrayResponse: Array.isArray(raw) } },
    );
    if (
      !Array.isArray(raw) ||
      raw.length !== 2 ||
      (typeof raw[0] !== 'number' && typeof raw[0] !== 'string') ||
      typeof raw[1] !== 'string'
    ) {
      throw new Error('Invalid offline lease script response.');
    }
    const result: [number | string, string] = [raw[0], raw[1]];
    this.logger.log(
      'OfflineTrainingLeaseService -> parseScriptTuple -> return:',
      { data: { outcome: result[0] } },
    );
    return result;
  }

  private parseLease(serialized: string): OfflineTrainingLease {
    this.logger.log('OfflineTrainingLeaseService -> parseLease -> params:', {
      params: { payloadPresent: serialized.length > 0 },
    });
    const parsed: unknown = JSON.parse(serialized);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('expiresAt' in parsed) ||
      !('installationId' in parsed) ||
      !('leaseId' in parsed) ||
      !('personId' in parsed) ||
      typeof parsed.expiresAt !== 'string' ||
      typeof parsed.installationId !== 'string' ||
      typeof parsed.leaseId !== 'string' ||
      typeof parsed.personId !== 'string'
    ) {
      throw new Error('Invalid offline lease payload.');
    }
    const result = parsed as OfflineTrainingLease;
    this.logger.log('OfflineTrainingLeaseService -> parseLease -> return:', {
      data: { parsed: true },
    });
    return result;
  }

  private isPublicState(
    value: number | string,
  ): value is OfflineTrainingLeaseState {
    this.logger.log('OfflineTrainingLeaseService -> isPublicState -> params:', {
      params: { valueType: typeof value },
    });
    const result = ['created', 'taken-over', 'unchanged'].includes(
      String(value),
    );
    this.logger.log('OfflineTrainingLeaseService -> isPublicState -> return:', {
      data: { valid: result },
    });
    return result;
  }

  private rethrowKnownOrUnavailable(error: unknown, method: string): never {
    this.logger.log(
      'OfflineTrainingLeaseService -> rethrowKnownOrUnavailable -> params:',
      { params: { method } },
    );
    if (
      error instanceof OfflineTrainingLeaseExpiredError ||
      error instanceof OfflineTrainingLeaseRevokedError ||
      error instanceof OfflineTrainingLeaseTakeoverRequiredError
    ) {
      this.logger.warn(
        `OfflineTrainingLeaseService -> ${method} -> domain error:`,
        { data: { errorName: error.name } },
      );
      throw error;
    }
    this.logger.error(
      `OfflineTrainingLeaseService -> ${method} -> unavailable error:`,
      {
        data: {
          errorName:
            error instanceof RedisUnavailableError
              ? RedisUnavailableError.name
              : 'InvalidRedisResponse',
        },
      },
    );
    throw new OfflineTrainingLeaseUnavailableError();
  }
}
