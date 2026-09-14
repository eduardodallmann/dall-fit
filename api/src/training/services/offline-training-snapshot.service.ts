import { Injectable, Logger } from '@nestjs/common';

import { RedisClientService } from '~/redis/redis-client.service';
import { RedisKeyService } from '~/redis/redis-key.service';
import { RedisUnavailableError } from '~/redis/redis.errors';
import {
  OFFLINE_TRAINING_SNAPSHOT_TTL_MS,
  type OfflineTrainingSnapshotIngestInput,
  type OfflineTrainingSnapshotIngestResult,
} from '~/training/domain/offline-training-snapshot.types';
import {
  OfflineTrainingLeaseExpiredError,
  OfflineTrainingLeaseRevokedError,
} from '~/training/errors/offline-training-lease.errors';
import {
  OfflineTrainingExecutionConflictError,
  OfflineTrainingSnapshotIdempotencyConflictError,
  OfflineTrainingSnapshotStaleError,
  OfflineTrainingSnapshotUnavailableError,
} from '~/training/errors/offline-training-snapshot.errors';
import { TrainingClockService } from '~/training/services/training-clock.service';

const INGEST_SCRIPT = `
local leaseRaw = redis.call('GET', KEYS[1])
if not leaseRaw then return {'lease-expired', '', '', ''} end
local lease = cjson.decode(leaseRaw)
if lease.personId ~= ARGV[1] or lease.planId ~= ARGV[2] or lease.installationId ~= ARGV[3] or lease.leaseId ~= ARGV[4] then
  return {'lease-revoked', '', '', ''}
end

local currentExecutionId = redis.call('HGET', KEYS[2], 'executionId')
if currentExecutionId then
  if currentExecutionId ~= ARGV[5] then return {'execution-conflict', '', '', ''} end
  local currentRevision = tonumber(redis.call('HGET', KEYS[2], 'revision'))
  local incomingRevision = tonumber(ARGV[6])
  if incomingRevision < currentRevision then return {'stale', '', '', ''} end
  if incomingRevision == currentRevision then
    local currentHash = redis.call('HGET', KEYS[2], 'contentHash')
    if currentHash ~= ARGV[7] then return {'idempotency-conflict', '', '', ''} end
    return {
      'duplicate',
      redis.call('HGET', KEYS[2], 'acceptedAtMs'),
      redis.call('HGET', KEYS[2], 'orderedAtMs'),
      redis.call('HGET', KEYS[2], 'expiresAtMs')
    }
  end
end

local nowMs = tonumber(ARGV[10])
local expiresAtMs = tonumber(ARGV[11])
local clientUpdatedAtMs = tonumber(ARGV[9])
local orderedAtMs = clientUpdatedAtMs
if currentExecutionId then
  local previousClientUpdatedAtMs = tonumber(redis.call('HGET', KEYS[2], 'clientUpdatedAtMs'))
  local previousOrderedAtMs = tonumber(redis.call('HGET', KEYS[2], 'orderedAtMs'))
  if clientUpdatedAtMs <= previousClientUpdatedAtMs or clientUpdatedAtMs <= previousOrderedAtMs then
    orderedAtMs = math.max(nowMs, previousOrderedAtMs + 1)
  end
end

lease.expiresAt = ARGV[12]
redis.call('SET', KEYS[1], cjson.encode(lease), 'PXAT', ARGV[11])
redis.call('HSET', KEYS[2],
  'payloadVersion', '1',
  'executionId', ARGV[5],
  'revision', ARGV[6],
  'contentHash', ARGV[7],
  'clientUpdatedAt', ARGV[8],
  'clientUpdatedAtMs', ARGV[9],
  'acceptedAtMs', ARGV[10],
  'orderedAtMs', tostring(orderedAtMs),
  'expiresAtMs', ARGV[11],
  'snapshot', ARGV[13]
)
redis.call('PEXPIREAT', KEYS[2], ARGV[11])
return {'accepted', ARGV[10], tostring(orderedAtMs), ARGV[11]}
`;

type ScriptState =
  | 'accepted'
  | 'duplicate'
  | 'execution-conflict'
  | 'idempotency-conflict'
  | 'lease-expired'
  | 'lease-revoked'
  | 'stale';

@Injectable()
export class OfflineTrainingSnapshotService {
  private readonly logger = new Logger(OfflineTrainingSnapshotService.name);

  constructor(
    private readonly redis: RedisClientService,
    private readonly keys: RedisKeyService,
    private readonly clock: TrainingClockService,
  ) {}

  async ingest(
    input: OfflineTrainingSnapshotIngestInput,
  ): Promise<OfflineTrainingSnapshotIngestResult> {
    this.logger.log('OfflineTrainingSnapshotService -> ingest -> params:', {
      params: {
        payloadVersion: input.request.payloadVersion,
        revisionCategory: input.request.revision === 0 ? 'initial' : 'advanced',
      },
    });
    const nowMs = this.clock.now().getTime();
    const expiresAtMs = nowMs + OFFLINE_TRAINING_SNAPSHOT_TTL_MS;
    const leaseKey = this.keys.create('offline-training-lease', input.personId);
    const snapshotKey = this.keys.create(
      'offline-training-snapshot',
      input.personId,
    );
    try {
      const raw = await this.redis.execute((client) =>
        client.eval(
          INGEST_SCRIPT,
          2,
          leaseKey,
          snapshotKey,
          input.personId,
          input.request.snapshot.plan.planId,
          input.request.installationId,
          input.request.leaseId,
          input.request.executionId,
          String(input.request.revision),
          input.contentHash,
          input.request.clientUpdatedAt,
          String(Date.parse(input.request.clientUpdatedAt)),
          String(nowMs),
          String(expiresAtMs),
          new Date(expiresAtMs).toISOString(),
          input.serializedSnapshot,
        ),
      );
      const [state, acceptedAtMs, orderedAtMs, persistedExpiresAtMs] =
        this.parseScriptResult(raw);
      this.logger.log(
        'OfflineTrainingSnapshotService -> ingest -> redis return:',
        { data: { state } },
      );
      const successState = this.toSuccessState(state);
      const result: OfflineTrainingSnapshotIngestResult = {
        acceptedAt: new Date(Number(acceptedAtMs)).toISOString(),
        executionId: input.request.executionId,
        expiresAt: new Date(Number(persistedExpiresAtMs)).toISOString(),
        orderedAt: new Date(Number(orderedAtMs)).toISOString(),
        revision: input.request.revision,
        state: successState,
      };
      this.logger.log('OfflineTrainingSnapshotService -> ingest -> return:', {
        data: { state: successState },
      });
      return result;
    } catch (error: unknown) {
      this.rethrowKnownOrUnavailable(error);
    }
  }

  private parseScriptResult(
    raw: unknown,
  ): [ScriptState, string, string, string] {
    this.logger.log(
      'OfflineTrainingSnapshotService -> parseScriptResult -> params:',
      { params: { arrayResponse: Array.isArray(raw) } },
    );
    if (
      !Array.isArray(raw) ||
      raw.length !== 4 ||
      !raw.every((item) => typeof item === 'string')
    ) {
      throw new Error('Invalid offline snapshot script response.');
    }
    const states: readonly ScriptState[] = [
      'accepted',
      'duplicate',
      'execution-conflict',
      'idempotency-conflict',
      'lease-expired',
      'lease-revoked',
      'stale',
    ];
    if (!states.includes(raw[0] as ScriptState)) {
      throw new Error('Invalid offline snapshot script state.');
    }
    const result = raw as [ScriptState, string, string, string];
    this.logger.log(
      'OfflineTrainingSnapshotService -> parseScriptResult -> return:',
      { data: { state: result[0] } },
    );
    return result;
  }

  private toSuccessState(state: ScriptState): 'accepted' | 'duplicate' {
    this.logger.log(
      'OfflineTrainingSnapshotService -> toSuccessState -> params:',
      { params: { state } },
    );
    if (state === 'lease-expired') throw new OfflineTrainingLeaseExpiredError();
    if (state === 'lease-revoked') throw new OfflineTrainingLeaseRevokedError();
    if (state === 'stale') throw new OfflineTrainingSnapshotStaleError();
    if (state === 'idempotency-conflict') {
      throw new OfflineTrainingSnapshotIdempotencyConflictError();
    }
    if (state === 'execution-conflict') {
      throw new OfflineTrainingExecutionConflictError();
    }
    this.logger.log(
      'OfflineTrainingSnapshotService -> toSuccessState -> return:',
      { data: { acceptedState: state } },
    );
    return state;
  }

  private rethrowKnownOrUnavailable(error: unknown): never {
    this.logger.log(
      'OfflineTrainingSnapshotService -> rethrowKnownOrUnavailable -> params:',
      { params: { errorKnown: error instanceof Error } },
    );
    if (
      error instanceof OfflineTrainingLeaseExpiredError ||
      error instanceof OfflineTrainingLeaseRevokedError ||
      error instanceof OfflineTrainingSnapshotStaleError ||
      error instanceof OfflineTrainingSnapshotIdempotencyConflictError ||
      error instanceof OfflineTrainingExecutionConflictError
    ) {
      this.logger.warn(
        'OfflineTrainingSnapshotService -> ingest -> domain error:',
        { data: { errorName: error.name } },
      );
      throw error;
    }
    this.logger.error(
      'OfflineTrainingSnapshotService -> ingest -> unavailable error:',
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
